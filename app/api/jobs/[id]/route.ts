import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getOwner, removeJob } from "@/lib/jobs";
import { isSameOriginMutation } from "@/lib/request-security";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const english = request.headers.get("accept-language")?.toLowerCase().startsWith("en") ?? false;
  const message = (fr: string, en: string) => english ? en : fr;
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: message("Requête non autorisée.", "Unauthorized request.") }, { status: 403 });
  }
  try {
    const job = await removeJob(id, getOwner(request));
    if (!job) return NextResponse.json({ error: message("Génération introuvable.", "Generation not found.") }, { status: 404 });
    for (const filePath of [job.videoPath, job.imagePath]) {
      if (!filePath) continue;
      try {
        await unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "JOB_PROCESSING") {
      return NextResponse.json({ error: message("Attendez la fin de la génération avant de la supprimer.", "Wait for generation to finish before deleting it.") }, { status: 409 });
    }
    console.error("Unable to remove video job:", error);
    return NextResponse.json({ error: message("Impossible de supprimer cette génération.", "Unable to delete this generation.") }, { status: 500 });
  }
}
