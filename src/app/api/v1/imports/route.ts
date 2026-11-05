import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { logAuditEvent } from "@/lib/audit";

interface ImportRowPayload {
  title?: string;
  fullName: string;
  designation?: string;
  institution?: string;
  email?: string;
  phone?: string;
  categoryKey?: string;
  companionAllowance?: number;
}

export const POST = withActor(async (request, { actor }) => {
  const user = actor;
  const body = await request.json();
  const { eventId, originalFilename, rows, mode } = body as {
    eventId: string;
    originalFilename: string;
    rows: ImportRowPayload[];
    mode?: "preview" | "commit";
  };

  if (!eventId || !rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: "eventId and rows array are required" }, { status: 400 });
  }

  await authorizeEvent(actor, "guests.import", eventId);
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { categories: true },
  });

  const existingGuests = await prisma.eventGuest.findMany({
    where: { eventId },
    include: { person: true },
  });

  const existingEmails = new Set(
    existingGuests.map((g) => g.person.email?.toLowerCase()).filter(Boolean)
  );
  const existingNames = new Set(
    existingGuests.map((g) => g.person.fullName.toLowerCase())
  );

  const evaluatedRows = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!row.fullName || row.fullName.trim().length < 2) {
      errors.push("Missing or invalid recipient name");
    }

    if (row.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.email.trim())) {
        errors.push("Invalid email format");
      } else if (existingEmails.has(row.email.toLowerCase().trim())) {
        warnings.push(`Exact email match already invited to this event: ${row.email}`);
      }
    } else {
      warnings.push("No email address provided (paper invitation required)");
    }

    if (row.fullName && existingNames.has(row.fullName.toLowerCase().trim())) {
      warnings.push(`Probable duplicate name detected: ${row.fullName}`);
    }

    let outcome: "valid" | "warning" | "error" = "valid";
    if (errors.length > 0) {
      outcome = "error";
      errorCount++;
    } else if (warnings.length > 0) {
      outcome = "warning";
      warningCount++;
    } else {
      validCount++;
    }

    evaluatedRows.push({
      rowNumber: idx + 1,
      sourceData: row,
      outcome,
      errors,
      warnings,
    });
  }

  // If mode === "preview", return the validation results without writing
  if (mode === "preview") {
    return NextResponse.json({
      data: {
        totalRows: rows.length,
        validCount,
        warningCount,
        errorCount,
        previewRows: evaluatedRows.slice(0, 50),
      },
    });
  }

  // Commit Mode: Transactional Batch Import
  const importBatch = await prisma.importBatch.create({
    data: {
      eventId,
      uploadedBy: user?.userId || "system",
      originalFilename: originalFilename || "guest_list.csv",
      storageKey: `imports/${eventId}/${Date.now()}_import.csv`,
      status: errorCount > 0 ? "completed_with_errors" : "completed",
      totalRows: rows.length,
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      importedRows: validCount + warningCount,
    },
  });

  const categoriesByKey = new Map(event.categories.map((c) => [c.categoryKey, c.id]));
  const defaultCategory = event.categories[event.categories.length - 1]; // Rank 5 default

  for (const item of evaluatedRows) {
    if (item.outcome === "error") {
      await prisma.importRowResult.create({
        data: {
          importBatchId: importBatch.id,
          rowNumber: item.rowNumber,
          sourceData: JSON.stringify(item.sourceData),
          outcome: "error",
          errors: JSON.stringify(item.errors),
          warnings: JSON.stringify(item.warnings),
        },
      });
      continue;
    }

    const row = item.sourceData;

    // 1. Resolve or create institution
    let institution = null;
    if (row.institution) {
      institution = await prisma.institution.findFirst({
        where: { organizationId: event.organizationId, name: row.institution.trim() },
      });
      if (!institution) {
        institution = await prisma.institution.create({
          data: {
            organizationId: event.organizationId,
            name: row.institution.trim(),
          },
        });
      }
    }

    // 2. Resolve or create person
    let person = row.email
      ? await prisma.person.findFirst({
          where: { organizationId: event.organizationId, email: row.email.toLowerCase().trim() },
        })
      : null;

    if (!person) {
      person = await prisma.person.create({
        data: {
          organizationId: event.organizationId,
          institutionId: institution?.id,
          title: row.title,
          fullName: row.fullName.trim(),
          designation: row.designation,
          email: row.email ? row.email.toLowerCase().trim() : null,
          phone: row.phone,
        },
      });
    }

    // 3. Resolve protocol category
    const categoryId = row.categoryKey
      ? categoriesByKey.get(row.categoryKey) || defaultCategory?.id
      : defaultCategory?.id;

    // 4. Create EventGuest
    const eventGuest = await prisma.eventGuest.create({
      data: {
        eventId,
        personId: person.id,
        institutionId: institution?.id,
        protocolCategoryId: categoryId,
        guestReference: `GH-GST-${Math.floor(1000 + Math.random() * 9000)}`,
        companionAllowance: row.companionAllowance ?? 0,
        guestStatus: "active",
        createdBy: user?.userId,
      },
    });

    await prisma.importRowResult.create({
      data: {
        importBatchId: importBatch.id,
        rowNumber: item.rowNumber,
        sourceData: JSON.stringify(item.sourceData),
        outcome: "created",
        errors: JSON.stringify(item.errors),
        warnings: JSON.stringify(item.warnings),
        personId: person.id,
        eventGuestId: eventGuest.id,
      },
    });
  }

  // Audit log
  if (user) {
    await logAuditEvent({
      organizationId: event.organizationId,
      eventId,
      actorUserId: user.userId,
      action: "GUEST_BATCH_IMPORTED",
      entityType: "import_batch",
      entityId: importBatch.id,
      afterData: {
        total: rows.length,
        imported: validCount + warningCount,
        errors: errorCount,
      },
    });
  }

  return NextResponse.json({
    data: {
      batchId: importBatch.id,
      status: importBatch.status,
      totalRows: rows.length,
      importedCount: validCount + warningCount,
      errorCount,
    },
  });
});
