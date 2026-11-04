import { NextResponse } from "next/server";

export async function GET() {
  for (let port = 20240; port <= 20250; port++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      const res = await fetch(`http://127.0.0.1:${port}/quicktunnel`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.hostname) {
          return NextResponse.json({
            success: true,
            data: {
              active: true,
              hostname: data.hostname,
              publicUrl: `https://${data.hostname}`,
            },
          });
        }
      }
    } catch {
      // try next port
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      active: false,
      hostname: null,
      publicUrl: null,
    },
  });
}

