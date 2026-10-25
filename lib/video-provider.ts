import type { VideoFormat, VideoStyle } from "./jobs";

export type GenerationInput = {
  prompt: string;
  style: VideoStyle;
  format: VideoFormat;
  duration: number;
  image?: Buffer;
  imageType?: string;
};

export interface VideoProvider {
  generate(input: GenerationInput): Promise<Buffer>;
}

const styleInstructions: Record<VideoStyle, string> = {
  realistic: "photorealistic, natural lighting, detailed textures",
  anime: "high-quality anime illustration, expressive characters, fluid animation",
  cinematic: "cinematic composition, dramatic lighting, film-grade color",
  "3d": "polished 3D animation, dimensional lighting, detailed render"
};

export class HuggingFaceVideoProvider implements VideoProvider {
  async generate(input: GenerationInput): Promise<Buffer> {
    const token = process.env.HF_TOKEN;
    if (!token) throw new Error("HF_TOKEN_MISSING");
    const model = input.image
      ? process.env.HF_IMAGE_TO_VIDEO_MODEL || "stabilityai/stable-video-diffusion-img2vid-xt"
      : process.env.HF_TEXT_TO_VIDEO_MODEL || "Wan-AI/Wan2.1-T2V-1.3B";
    const endpoint = `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(model)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": input.image ? input.imageType || "image/jpeg" : "application/json",
          Accept: "video/*, application/octet-stream"
        },
        body: input.image
          ? new Uint8Array(input.image)
          : JSON.stringify({
              inputs: `${input.prompt}. ${styleInstructions[input.style]}.`,
              parameters: { num_frames: Math.min(24, Math.max(8, input.duration * 4)) }
            }),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        if (response.status === 429) throw new Error("HF_QUOTA");
        if (response.status === 503) throw new Error("HF_LOADING");
        throw new Error(`HF_ERROR:${response.status}:${detail}`);
      }
      const type = response.headers.get("content-type") || "";
      if (!type.startsWith("video/") && !type.includes("octet-stream")) {
        throw new Error("HF_INVALID_OUTPUT");
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("HF_EMPTY_OUTPUT");
      return bytes;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("HF_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createVideoProvider(): VideoProvider {
  return new HuggingFaceVideoProvider();
}

export function explainProviderError(error: unknown, language: "fr" | "en" = "fr"): string {
  const message = error instanceof Error ? error.message : "";
  const en = language === "en";
  if (message === "FFMPEG_MISSING") return en ? "FFmpeg is not installed on the server. Install it to finalize the video." : "FFmpeg n’est pas installé sur le serveur. Installez-le pour finaliser la vidéo.";
  if (message.startsWith("FFMPEG_ERROR:")) return en ? "The video could not be finalized. Check that FFmpeg and the H.264 encoder are installed." : "Impossible de finaliser la vidéo. Vérifiez que le serveur dispose de FFmpeg et de l’encodeur H.264.";
  if (message === "HF_TOKEN_MISSING") return en ? "The AI engine is not configured. Add HF_TOKEN to the server environment." : "Le moteur IA n’est pas configuré. Ajoutez HF_TOKEN dans l’environnement du serveur.";
  if (message === "HF_QUOTA") return en ? "The provider's free quota has been reached. Please try again later." : "Le quota gratuit du fournisseur est atteint. Réessayez plus tard.";
  if (message === "HF_LOADING") return en ? "The model is loading. Please try again in a few moments." : "Le modèle est en cours de chargement. Réessayez dans quelques instants.";
  if (message === "HF_TIMEOUT") return en ? "The engine did not respond in time. Please try again." : "Le moteur n’a pas répondu dans le délai imparti. Réessayez.";
  if (message === "HF_INVALID_OUTPUT" || message === "HF_EMPTY_OUTPUT") return en ? "The model did not return a video. Check that the configured model is compatible." : "Le modèle n’a pas renvoyé de vidéo. Vérifiez la compatibilité du modèle configuré.";
  if (message.startsWith("HF_ERROR:")) {
    const [, status, detail] = message.split(":");
    return en
      ? `The provider rejected the generation (HTTP ${status}). ${detail || "Check the model and your quota."}`
      : `Le fournisseur a refusé la génération (HTTP ${status}). ${detail || "Vérifiez le modèle et votre quota."}`;
  }
  return en ? "An error occurred during generation." : "Une erreur est survenue pendant la génération.";
}
