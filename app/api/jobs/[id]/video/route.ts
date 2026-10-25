import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getOwnedJob, getOwner } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getOwnedJob(params.id, getOwner(request));
    if (!job) return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
    if (job.status !== "completed" || !job.videoPath) return NextResponse.json({ error: "La vidéo n’est pas prête." }, { status: 409 });
    const file = await readFile(job.videoPath);
    const inline = new URL(request.url).searchParams.has("play");
    return new Response(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="nono-${params.id}.mp4"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Impossible de lire cette vidéo." }, { status: 500 });
  }
}
