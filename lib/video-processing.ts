import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { VideoFormat } from "./jobs";

export async function checkFfmpeg() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new Error("FFMPEG_MISSING"));
      else reject(error);
    });
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("FFMPEG_MISSING"));
    });
  });
}

export async function finalizeVideo(video: Buffer, format: VideoFormat, duration: number, watermark: boolean) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nono-video-"));
  const source = path.join(directory, "source.mp4");
  const output = path.join(directory, "output.mp4");
  const dimensions = format === "portrait" ? "720:1280" : format === "square" ? "720:720" : "1280:720";
  const filters = [
    `scale=${dimensions}:force_original_aspect_ratio=increase`,
    `crop=${dimensions}`,
    ...(watermark ? ["drawtext=text='Généré par IA':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.48:boxborderw=8:x=w-tw-20:y=h-th-20"] : [])
  ].join(",");
  try {
    await writeFile(source, video);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-stream_loop", "-1", "-i", source,
        "-t", String(duration),
        "-vf", filters,
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        output
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-1000); });
      child.once("error", (error) => {
        if ("code" in error && error.code === "ENOENT") reject(new Error("FFMPEG_MISSING"));
        else reject(error);
      });
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFMPEG_ERROR:${stderr.trim()}`));
      });
      const timeout = setTimeout(() => child.kill(), 120_000);
      child.once("close", () => clearTimeout(timeout));
    });
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
