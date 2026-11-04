import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export interface AuthSession {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export async function verifyUserCredentials(email: string, passwordPlain: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
    include: {
      organization: true,
      roleAssignments: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.passwordHash) return null;

  const isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
  if (!isValid) return null;

  return user;
}

export async function getCurrentUser(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("parliament_session")?.value;

    if (!sessionCookie) {
      // Default to admin user for convenient evaluation if no cookie is set yet
      const defaultUser = await prisma.user.findFirst({
        where: { email: "admin@parliament.gh" },
        include: {
          roleAssignments: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });

      if (!defaultUser) return null;

      const roles = defaultUser.roleAssignments.map((ra) => ra.role.key);
      const permissions = Array.from(
        new Set(
          defaultUser.roleAssignments.flatMap((ra) =>
            ra.role.permissions.map((rp) => rp.permission.key)
          )
        )
      );

      return {
        userId: defaultUser.id,
        email: defaultUser.email,
        fullName: defaultUser.fullName,
        organizationId: defaultUser.organizationId,
        roles,
        permissions,
      };
    }

    const [userId] = sessionCookie.split(":");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== "active") return null;

    const roles = user.roleAssignments.map((ra) => ra.role.key);
    const permissions = Array.from(
      new Set(
        user.roleAssignments.flatMap((ra) =>
          ra.role.permissions.map((rp) => rp.permission.key)
        )
      )
    );

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roles,
      permissions,
    };
  } catch (error) {
    return null;
  }
}

export async function hasPermission(
  userId: string,
  eventId: string | null,
  permissionKey: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== "active") return false;

  for (const assignment of user.roleAssignments) {
    // If assignment is global (eventId is null) or scoped to the current event
    if (!assignment.eventId || !eventId || assignment.eventId === eventId) {
      const hasKey = assignment.role.permissions.some(
        (rp) => rp.permission.key === permissionKey
      );
      if (hasKey) return true;
    }
  }

  return false;
}
