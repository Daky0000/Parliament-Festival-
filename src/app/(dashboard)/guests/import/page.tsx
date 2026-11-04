"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, ArrowRight, RefreshCw, FileText } from "lucide-react";
import Papa from "papaparse";

export default function ImportWizardPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sample CSV Data for instant demonstration
  const loadSampleData = () => {
    const sample = [
      {
        title: "Hon.",
        fullName: "Hon. Samuel Okudzeto Ablakwa",
        designation: "Member of Parliament (North Tongu)",
        institution: "Parliament of Ghana",
        email: "ablakwa@parliament.gh",
        categoryKey: "parliamentary_leadership",
        companionAllowance: 1,
      },
      {
        title: "H.E.",
        fullName: "H.E. Daniel Krull",
        designation: "German Ambassador to Ghana",
        institution: "Embassy of the Federal Republic of Germany",
        email: "ambassador@accr.diplo.de",
        categoryKey: "diplomatic_corps",
        companionAllowance: 1,
      },
      {
        title: "Most Rev.",
        fullName: "Most Rev. John Bonaventure Kwofie",
        designation: "Metropolitan Archbishop of Accra",
        institution: "Catholic Archdiocese of Accra",
        email: "archbishop@accracatholic.org",
        categoryKey: "clergy_religious",
        companionAllowance: 1,
      },
      {
        title: "COP",
        fullName: "COP Maame Yaa Tiwaa Addo-Danquah",
        designation: "Executive Director, EOCO",
        institution: "Economic and Organised Crime Office",
        email: "tiwaa.danquah@eoco.gov.gh",
        categoryKey: "public_security_judiciary",
        companionAllowance: 1,
      },
      {
        title: "Mr.",
        fullName: "Kwesi Pratt Jr.",
        designation: "Managing Editor, The Insight",
        institution: "Private Newspaper Publishers Association",
        email: "kwesipratt@insight.com.gh",
        categoryKey: "csos_private_sector",
        companionAllowance: 1,
      },
    ];

    setFileName("parliament_dignitaries_sample.csv");
    setParsedRows(sample);
    setStep(2);
    runPreviewValidation(sample, "parliament_dignitaries_sample.csv");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedRows(results.data);
        setStep(2);
        runPreviewValidation(results.data, file.name);
      },
    });
  };

  const runPreviewValidation = async (rows: any[], filename: string) => {
    setIsLoading(true);
    try {
      // Fetch event ID
      const eventsRes = await fetch("/api/v1/events");
      const eventsData = await eventsRes.json();
      const eventId = eventsData.data[0]?.id;

      const res = await fetch("/api/v1/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          originalFilename: filename,
          rows,
          mode: "preview",
        }),
      });
      const data = await res.json();
      setPreviewResult(data.data);
    } catch (err) {
      console.error("Validation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    setIsLoading(true);
    try {
      const eventsRes = await fetch("/api/v1/events");
      const eventsData = await eventsRes.json();
      const eventId = eventsData.data[0]?.id;

      const res = await fetch("/api/v1/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          originalFilename: fileName,
          rows: parsedRows,
          mode: "commit",
        }),
      });
      const data = await res.json();
      setCommitResult(data.data);
      setStep(3);
    } catch (err) {
      console.error("Commit error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Wizard Header */}
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#102343]">
          Guest Register Import Wizard
        </h2>
        <p className="text-xs text-[#667085] mt-1">
          Batch import dignitaries, validate email addresses, and prevent duplicate guest registrations.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="grid grid-cols-3 gap-3 text-xs font-semibold">
        <div
          className={`p-3 rounded-lg border text-center ${
            step === 1
              ? "bg-[#0A1830] text-[#DFCA95] border-[#C6A65B]"
              : "bg-white text-[#667085] border-[#E4E7EC]"
          }`}
        >
          1. Upload Spreadsheet
        </div>
        <div
          className={`p-3 rounded-lg border text-center ${
            step === 2
              ? "bg-[#0A1830] text-[#DFCA95] border-[#C6A65B]"
              : "bg-white text-[#667085] border-[#E4E7EC]"
          }`}
        >
          2. Validate & Review
        </div>
        <div
          className={`p-3 rounded-lg border text-center ${
            step === 3
              ? "bg-[#0A1830] text-[#DFCA95] border-[#C6A65B]"
              : "bg-white text-[#667085] border-[#E4E7EC]"
          }`}
        >
          3. Complete & Outcome
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white rounded-lg border border-[#E4E7EC] p-8 text-center space-y-6 shadow-sm">
          <div className="max-w-md mx-auto border-2 border-dashed border-[#C6A65B] rounded-lg p-8 hover:bg-[#F7F5F0]/50 transition-colors">
            <Upload className="w-10 h-10 text-[#C6A65B] mx-auto mb-3" />
            <h3 className="font-editorial font-bold text-base text-[#102343] mb-1">
              Select Guest Register File
            </h3>
            <p className="text-xs text-[#667085] mb-4">
              Upload standard CSV or XLSX with headers: <code>fullName, title, designation, institution, email, categoryKey</code>
            </p>

            <label className="bg-[#102343] text-[#DFCA95] border border-[#C6A65B] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors px-4 py-2 rounded-md text-xs font-bold cursor-pointer inline-flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Choose File
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="pt-4 border-t border-[#E4E7EC] flex items-center justify-center gap-3">
            <span className="text-xs text-[#667085]">Want to test immediately?</span>
            <button
              onClick={loadSampleData}
              className="text-xs font-bold text-[#102343] bg-[#F7F5F0] hover:bg-[#C6A65B] hover:text-[#0A1830] px-3 py-1.5 rounded border border-[#C6A65B] transition-colors"
            >
              Load Sample Parliamentary Delegation
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Validate & Preview */}
      {step === 2 && (
        <div className="bg-white rounded-lg border border-[#E4E7EC] p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
            <div>
              <h3 className="font-editorial font-bold text-base text-[#102343]">
                Validation Preview: {fileName}
              </h3>
              <p className="text-xs text-[#667085]">
                Detected {parsedRows.length} dignitary rows.
              </p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Cancel & Pick Another File
            </button>
          </div>

          {previewResult && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <div className="text-xs font-semibold text-emerald-800 uppercase">Valid Rows</div>
                <div className="text-xl font-bold text-emerald-700 mt-1">
                  {previewResult.validCount}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <div className="text-xs font-semibold text-amber-800 uppercase">Warnings (Duplicates)</div>
                <div className="text-xl font-bold text-amber-700 mt-1">
                  {previewResult.warningCount}
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded p-3">
                <div className="text-xs font-semibold text-rose-800 uppercase">Format Errors</div>
                <div className="text-xl font-bold text-rose-700 mt-1">
                  {previewResult.errorCount}
                </div>
              </div>
            </div>
          )}

          {/* Sample Rows Table */}
          <div className="border border-[#E4E7EC] rounded overflow-hidden">
            <div className="table-responsive-container">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0A1830] text-[#F7F5F0]">
                  <tr>
                    <th className="p-2.5 text-[#C6A65B]">Row</th>
                    <th className="p-2.5 text-[#C6A65B]">Dignitary</th>
                    <th className="p-2.5 text-[#C6A65B]">Designation & Institution</th>
                    <th className="p-2.5 text-[#C6A65B]">Email</th>
                    <th className="p-2.5 text-[#C6A65B]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7EC]">
                  {previewResult?.previewRows?.map((item: any) => (
                    <tr key={item.rowNumber} className="hover:bg-[#F7F5F0]">
                      <td className="p-2.5 font-mono text-[11px]">{item.rowNumber}</td>
                      <td className="p-2.5 font-bold text-[#102343]">
                        {item.sourceData.title} {item.sourceData.fullName}
                      </td>
                      <td className="p-2.5 text-[#667085]">
                        {item.sourceData.designation} &bull; {item.sourceData.institution}
                      </td>
                      <td className="p-2.5 text-[#667085]">{item.sourceData.email}</td>
                      <td className="p-2.5">
                        {item.outcome === "valid" ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Valid
                          </span>
                        ) : item.outcome === "warning" ? (
                          <span className="text-amber-700 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Warning
                          </span>
                        ) : (
                          <span className="text-rose-700 font-semibold">Error</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E7EC]">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border rounded text-xs font-semibold hover:bg-gray-100"
            >
              Back
            </button>
            <button
              onClick={handleCommit}
              disabled={isLoading}
              className="bg-[#102343] text-[#DFCA95] border border-[#C6A65B] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors px-5 py-2 rounded text-xs font-bold flex items-center gap-2 shadow-sm"
            >
              {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Commit Import Batch ({parsedRows.length} Dignitaries)
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success Outcome */}
      {step === 3 && (
        <div className="bg-white rounded-lg border border-emerald-300 p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h3 className="font-editorial text-xl font-bold text-[#102343]">
            Import Batch Successfully Committed!
          </h3>
          <p className="text-xs text-[#667085] max-w-md mx-auto">
            {commitResult?.importedCount} dignitaries have been securely added to the active event protocol register.
          </p>

          <div className="pt-4 flex justify-center gap-3">
            <Link
              href="/guests"
              className="bg-[#102343] text-[#DFCA95] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors text-xs font-bold px-4 py-2 rounded-md shadow-sm"
            >
              View Dignitary Register
            </Link>
            <Link
              href="/invitations/campaigns"
              className="bg-[#C6A65B] text-[#0A1830] hover:bg-[#DFCA95] transition-colors text-xs font-bold px-4 py-2 rounded-md shadow-sm"
            >
              Prepare Invitation Campaign
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
