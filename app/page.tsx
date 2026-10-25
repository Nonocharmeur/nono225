"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowDownToLine, ArrowUpRight, ChevronDown, Clock3, Film, ImagePlus,
  LoaderCircle, Moon, Sparkles, Sun, Trash2, WandSparkles, X
} from "lucide-react";

type Language = "fr" | "en";
type Job = {
  id: string;
  prompt: string;
  style: string;
  format: string;
  duration: number;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  createdAt: string;
  error?: string;
  videoUrl?: string;
};

const copy = {
  fr: {
    badge: "STUDIO VIDÉO IA", title: "Donnez vie à", titleAccent: "vos idées.", subtitle: "Transformez une description ou une image en une courte vidéo, en quelques clics.",
    create: "Créer une vidéo", gallery: "Votre galerie", prompt: "Votre idée", promptHint: "Décrivez la scène, l’ambiance, le mouvement…", improve: "Améliorer",
    image: "Image de départ", upload: "Importer une image", uploadHint: "JPG, PNG ou WebP · 10 Mo max", style: "Style", format: "Format", duration: "Durée",
    realistic: "Réaliste", anime: "Anime", cinematic: "Cinématique", "3d": "3D", landscape: "Paysage", portrait: "Portrait", square: "Carré",
    watermark: "Ajouter « Généré par IA »", generate: "Générer la vidéo", generating: "Ajout à la file…", free: "gratuit / jour",
    queue: "Dans la file", queued: "En attente", processing: "Création", completed: "Prête", failed: "Échec", empty: "Votre galerie est encore vide.",
    emptyHint: "Vos créations apparaîtront ici.", download: "Télécharger", delete: "Supprimer", remaining: "générations gratuites restantes",
    moderation: "Les prompts faisant l’apologie de la violence ou décrivant du contenu sexuel explicite sont refusés.",
    improveDone: "Prompt amélioré", noPrompt: "Écrivez d’abord une idée à améliorer.", promptImageOnly: "Ajoutez une image ou écrivez une description.",
    quota: "Quota quotidien atteint. Revenez demain.", unknown: "Une erreur est survenue.", imageReady: "Image ajoutée",
    noVideoEngine: "Le moteur vidéo n’est pas encore configuré. Ajoutez votre jeton Hugging Face côté serveur.",
    watermarkNote: "Filigrane incrusté à l’export (FFmpeg requis).",
    imagePrompt: "Mouvement souhaité (facultatif)", created: "Créée", retry: "Réessayer", queueNote: "La disponibilité dépend du modèle et des quotas gratuits du fournisseur.",
    imageMotionNote: "Le modèle image-vidéo configuré peut ignorer le prompt et le style.",
    modes: "Texte ou image", uploadAgain: "Changer l’image", removeImage: "Retirer l’image", dark: "Activer le mode sombre", light: "Activer le mode clair",
    locale: "English", promptLocal: "Optimisation locale du texte — aucune API payante."
  },
  en: {
    badge: "AI VIDEO STUDIO", title: "Bring your ideas", titleAccent: "to life.", subtitle: "Turn a description or image into a short video in just a few clicks.",
    create: "Create a video", gallery: "Your gallery", prompt: "Your idea", promptHint: "Describe the scene, mood, movement…", improve: "Improve",
    image: "Starting image", upload: "Upload an image", uploadHint: "JPG, PNG or WebP · max 10 MB", style: "Style", format: "Format", duration: "Duration",
    realistic: "Realistic", anime: "Anime", cinematic: "Cinematic", "3d": "3D", landscape: "Landscape", portrait: "Portrait", square: "Square",
    watermark: "Add “AI generated” label", generate: "Generate video", generating: "Adding to queue…", free: "free / day",
    queue: "Queued", queued: "Queued", processing: "Creating", completed: "Ready", failed: "Failed", empty: "Your gallery is still empty.",
    emptyHint: "Your creations will show up here.", download: "Download", delete: "Delete", remaining: "free generations left",
    moderation: "Prompts glorifying violence or describing explicit sexual content are rejected.",
    improveDone: "Prompt improved", noPrompt: "Write an idea first.", promptImageOnly: "Add an image or write a description.",
    quota: "Daily quota reached. Come back tomorrow.", unknown: "Something went wrong.", imageReady: "Image added",
    noVideoEngine: "The video engine is not configured yet. Add your Hugging Face token on the server.",
    watermarkNote: "Watermark is embedded in the export (FFmpeg required).",
    imagePrompt: "Desired movement (optional)", created: "Created", retry: "Try again", queueNote: "Availability depends on model and free provider quotas.",
    imageMotionNote: "The configured image-to-video model may ignore the prompt and style.",
    modes: "Text or image", uploadAgain: "Change image", removeImage: "Remove image", dark: "Enable dark mode", light: "Enable light mode",
    locale: "Français", promptLocal: "Local prompt enhancement — no paid API."
  }
} as const;

const styles = ["realistic", "anime", "cinematic", "3d"] as const;
const formats = [
  { id: "landscape", ratio: "16:9" },
  { id: "portrait", ratio: "9:16" },
  { id: "square", ratio: "1:1" }
] as const;

function enhancePrompt(prompt: string, lang: Language) {
  const suffix = lang === "fr"
    ? "Mouvement fluide et naturel, composition soignée, éclairage cohérent, détails nets, caméra stable."
    : "Fluid natural motion, thoughtful composition, consistent lighting, crisp details, steady camera.";
  const original = prompt.trim().replace(/[.!?]+$/, "");
  return `${original.slice(0, 1000 - suffix.length - 2)}. ${suffix}`;
}

export default function Home() {
  const [lang, setLang] = useState<Language>("fr");
  const [dark, setDark] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<(typeof styles)[number]>("cinematic");
  const [format, setFormat] = useState<(typeof formats)[number]["id"]>("landscape");
  const [duration, setDuration] = useState(5);
  const [watermark, setWatermark] = useState(true);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [remaining, setRemaining] = useState(3);
  const [limit, setLimit] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState<Job | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const t = copy[lang];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (!response.ok) {
        setError(t.unknown);
        return;
      }
      const data = await response.json();
      setJobs(data.jobs || []);
      setRemaining(data.remaining ?? 0);
      setLimit(data.limit ?? 3);
    } catch {
      setError(t.unknown);
    }
  }, [t.unknown]);

  useEffect(() => {
    void refreshJobs();
    const timer = window.setInterval(() => void refreshJobs(), 3000);
    return () => window.clearInterval(timer);
  }, [refreshJobs]);

  useEffect(() => {
    if (!image) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const activeCount = useMemo(() => jobs.filter((job) => job.status === "queued" || job.status === "processing").length, [jobs]);

  const submit = async () => {
    setError("");
    setNotice("");
    if (!prompt.trim() && !image) {
      setError(t.promptImageOnly);
      return;
    }
    if (remaining < 1) {
      setError(t.quota);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("prompt", prompt.trim());
      form.set("language", lang);
      form.set("style", style);
      form.set("format", format);
      form.set("duration", String(duration));
      form.set("watermark", String(watermark));
      if (image) form.set("image", image);
      const response = await fetch("/api/jobs", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t.unknown);
      } else {
        setNotice(t.generating);
        setPrompt("");
        setImage(null);
        await refreshJobs();
      }
    } catch {
      setError(t.unknown);
    } finally {
      setBusy(false);
    }
  };

  const improve = () => {
    if (!prompt.trim()) {
      setError(t.noPrompt);
      return;
    }
    setPrompt(enhancePrompt(prompt, lang));
    setNotice(t.improveDone);
    setError("");
  };

  const removeJob = async (job: Job) => {
    try {
      const response = await fetch(`/api/jobs/${job.id}`, { method: "DELETE", headers: { "Accept-Language": lang } });
      const data = await response.json();
      if (!response.ok) setError(data.error || t.unknown);
      else await refreshJobs();
    } catch {
      setError(t.unknown);
    }
  };

  const options = (key: "realistic" | "anime" | "cinematic" | "3d") => t[key];
  const statusText = (status: Job["status"]) => t[status];

  return (
    <main className="min-h-screen overflow-hidden bg-paper text-ink transition-colors dark:bg-ink dark:text-[#f3f3ec]">
      <header className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a className="flex items-center gap-2.5" href="#" aria-label="Nono home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-lime dark:bg-lime dark:text-ink"><Film size={18} /></span>
          <span className="text-lg font-black tracking-tight">nono<span className="text-[#a4d849]">.</span></span>
          <span className="ml-1 hidden rounded-full border border-black/10 px-2.5 py-1 text-[9px] font-bold tracking-[.16em] text-black/45 dark:border-white/15 dark:text-white/45 sm:inline">{t.badge}</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3.5 py-2 text-xs dark:border-white/10 dark:bg-white/5 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9dcc45]" />
            <b>{remaining}</b><span className="text-black/50 dark:text-white/45">{t.remaining}</span>
          </div>
          <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} className="rounded-full px-3 py-2 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10">{t.locale}</button>
          <button onClick={() => setDark(!dark)} title={dark ? t.light : t.dark} aria-label={dark ? t.light : t.dark} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>

      <section className="relative mx-auto max-w-[1440px] px-5 pb-10 pt-8 sm:px-8 sm:pt-14 lg:px-12 lg:pt-20">
        <div className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-lime/25 blur-[100px] dark:bg-lime/10" />
        <div className="relative grid gap-12 lg:grid-cols-[.83fr_1.17fr] lg:gap-16">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/65 px-3 py-1.5 text-[10px] font-extrabold tracking-[.15em] dark:border-white/10 dark:bg-white/5">
              <Sparkles size={12} className="text-[#83b831]" /> {t.modes}
            </div>
            <h1 className="text-[clamp(3.4rem,8vw,6.7rem)] font-black leading-[.88] tracking-[-.075em]">{t.title}<br /><span className="text-[#9acb46]">{t.titleAccent}</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-black/55 dark:text-white/55">{t.subtitle}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-2 rounded-full bg-lime/35 px-3 py-2 font-bold dark:bg-lime/10"><Sparkles size={14} /> {remaining}/{limit} {t.free}</span>
              <span className="text-black/40 dark:text-white/40">{t.queueNote}</span>
            </div>
            <div className="grain relative mt-11 hidden h-44 w-full max-w-sm overflow-hidden rounded-[28px] border border-black/5 bg-[#e9eddd] dark:border-white/10 dark:bg-[#23251e] lg:block">
              <div className="absolute -bottom-10 left-8 h-32 w-32 rounded-full bg-[#d2eaa6] blur-2xl dark:bg-[#455627]" />
              <div className="absolute left-14 top-5 h-28 w-28 rounded-[48%_52%_38%_62%] border border-[#819e4b]/30 bg-gradient-to-br from-[#f9ffe8] to-[#a5be70] shadow-xl dark:from-[#555e3b] dark:to-[#394225]" />
              <div className="absolute right-12 top-8 max-w-[130px] text-[10px] font-bold uppercase leading-5 tracking-[.18em] text-black/45 dark:text-white/45">Imagine.<br />Generate.<br />Repeat.</div>
              <div className="absolute bottom-4 right-4 rounded-full bg-ink px-3 py-1.5 text-[9px] font-bold tracking-[.12em] text-lime dark:bg-lime dark:text-ink">01 — 03</div>
            </div>
          </div>

          <section className="relative rounded-[28px] border border-black/[.08] bg-white/85 p-5 shadow-[0_24px_80px_-42px_rgba(24,32,10,.3)] backdrop-blur-xl dark:border-white/10 dark:bg-[#1a1b17] sm:rounded-[32px] sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-black/40 dark:text-white/40">{t.badge}</div><h2 className="mt-2 text-xl font-black tracking-tight">{t.create}</h2></div>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-lime/45 text-ink"><WandSparkles size={18} /></span>
            </div>
            <label className="mt-7 flex items-center justify-between text-xs font-bold">{t.prompt}
              <button onClick={improve} type="button" className="flex items-center gap-1.5 rounded-full bg-[#f1f5e9] px-3 py-1.5 text-[11px] font-bold text-[#536b31] transition hover:bg-lime/50 dark:bg-white/5 dark:text-lime"><WandSparkles size={13} /> {t.improve}</button>
            </label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1000} placeholder={t.promptHint} rows={4} className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-[#fafbf7] p-4 text-sm leading-6 outline-none transition placeholder:text-black/30 focus:border-[#a2ce51] dark:border-white/10 dark:bg-[#131410] dark:placeholder:text-white/25" />
            <div className="mt-1 flex justify-between text-[10px] text-black/40 dark:text-white/40"><span>{t.moderation}</span><span>{prompt.length}/1000</span></div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-bold"><span>{t.image}</span>{image && <button type="button" onClick={() => setImage(null)} className="text-[10px] font-semibold text-black/45 hover:text-red-500 dark:text-white/45">{t.removeImage}</button>}</div>
              {imagePreview ? <div className="relative h-36 overflow-hidden rounded-2xl border border-black/10 dark:border-white/10"><Image src={imagePreview} alt={lang === "fr" ? "Image à animer" : "Image to animate"} width={640} height={360} unoptimized className="h-full w-full object-cover" /><div className="absolute bottom-2 left-2 rounded-lg bg-black/65 px-2 py-1 text-[10px] text-white">{image?.name}</div><button onClick={() => fileInput.current?.click()} className="absolute right-2 top-2 rounded-lg bg-black/65 p-2 text-white" aria-label={t.uploadAgain}><ImagePlus size={15} /></button></div> :
                <button onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-black/15 bg-[#fafbf7] px-4 py-3.5 text-left transition hover:border-[#a2ce51] dark:border-white/15 dark:bg-[#131410]">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime/40"><ImagePlus size={16} /></span><span><span className="block text-xs font-bold">{t.upload}</span><span className="mt-1 block text-[10px] text-black/45 dark:text-white/40">{t.uploadHint}</span></span>
                </button>}
              {imagePreview && <p className="mt-2 text-[10px] text-black/40 dark:text-white/40">{t.imageMotionNote}</p>}
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setImage(e.target.files?.[0] || null)} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_1.2fr]">
              <div><label className="mb-2 block text-xs font-bold">{t.style}</label><div className="relative"><select value={style} onChange={(e) => setStyle(e.target.value as typeof style)} className="w-full appearance-none rounded-xl border border-black/10 bg-[#fafbf7] px-3 py-3 text-xs font-semibold outline-none focus:border-[#a2ce51] dark:border-white/10 dark:bg-[#131410]">{styles.map((item) => <option key={item} value={item}>{options(item)}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-black/40" /></div></div>
              <div><label className="mb-2 block text-xs font-bold">{t.format}</label><div className="relative"><select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="w-full appearance-none rounded-xl border border-black/10 bg-[#fafbf7] px-3 py-3 text-xs font-semibold outline-none focus:border-[#a2ce51] dark:border-white/10 dark:bg-[#131410]">{formats.map((item) => <option key={item.id} value={item.id}>{t[item.id]} · {item.ratio}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-black/40" /></div></div>
              <div className="col-span-2 sm:col-span-1"><label className="mb-2 flex items-center justify-between text-xs font-bold"><span>{t.duration}</span><span className="rounded-md bg-lime/35 px-2 py-0.5">{duration}s</span></label><input className="range mt-3 w-full" type="range" min="3" max="10" step="1" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
            </div>
            <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-xs text-black/60 dark:text-white/60"><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="accent-[#a2ce51]" />{t.watermark}</label>
            <p className="mt-1 pl-5 text-[10px] text-black/40 dark:text-white/40">{t.watermarkNote}</p>
            {(error || notice) && <div role={error ? "alert" : "status"} className={`mt-4 rounded-xl px-3.5 py-2.5 text-xs ${error ? "bg-red-500/10 text-red-600 dark:text-red-300" : "bg-lime/25 text-[#536b31] dark:text-lime"}`}>{error || notice}</div>}
            <button onClick={submit} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-[#303128] disabled:cursor-not-allowed disabled:opacity-55 dark:bg-lime dark:text-ink dark:hover:bg-[#d5ff87]">
              {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={16} />}{busy ? t.generating : t.generate}<ArrowUpRight size={15} className="ml-auto" />
            </button>
            <p className="mt-2 text-center text-[10px] text-black/40 dark:text-white/40">{t.promptLocal} · {activeCount > 0 ? `${activeCount} ${t.queue.toLowerCase()}` : t.queueNote}</p>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 pb-20 sm:px-8 lg:px-12">
        <div className="mb-6 flex items-end justify-between border-b border-black/10 pb-4 dark:border-white/10">
          <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-black/40 dark:text-white/40">Nº 01 — WORKSPACE</div><h2 className="mt-2 text-2xl font-black tracking-tight">{t.gallery}<span className="ml-2 text-sm font-medium text-black/40 dark:text-white/40">({jobs.length})</span></h2></div>
          <span className="hidden items-center gap-2 text-xs text-black/45 dark:text-white/45 sm:flex"><Clock3 size={14} />{t.remaining}: {remaining}</span>
        </div>
        {jobs.length === 0 ? <div className="grid min-h-48 place-items-center rounded-3xl border border-dashed border-black/15 text-center dark:border-white/15"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-lime/30"><Film size={18} /></span><p className="mt-3 text-sm font-bold">{t.empty}</p><p className="mt-1 text-xs text-black/45 dark:text-white/45">{t.emptyHint}</p></div></div> :
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => <article key={job.id} className="overflow-hidden rounded-3xl border border-black/[.08] bg-white/75 dark:border-white/10 dark:bg-[#1a1b17]">
              <button type="button" onClick={() => job.status === "completed" && setPlaying(job)} className={`relative block aspect-video w-full text-left ${job.status === "completed" ? "cursor-pointer bg-black" : "skeleton"}`}>
                {job.status === "completed" && job.videoUrl ? <video src={`${job.videoUrl}?play=1`} className="h-full w-full object-cover" muted playsInline /> : <div className="absolute inset-0 grid place-items-center">{job.status === "processing" ? <LoaderCircle size={26} className="animate-spin text-[#88b936]" /> : job.status === "failed" ? <X size={24} className="text-red-500" /> : <Clock3 size={24} className="text-black/30 dark:text-white/30" />}</div>}
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1.5 text-[10px] font-bold text-white"><span className={`h-1.5 w-1.5 rounded-full ${job.status === "completed" ? "bg-lime" : job.status === "failed" ? "bg-red-400" : "animate-pulse bg-amber-300"}`} />{statusText(job.status)}</div>
                {job.status === "processing" || job.status === "queued" ? <div className="absolute bottom-0 left-0 h-1 w-full bg-black/10"><div className="h-full bg-[#a4d849] transition-all" style={{ width: `${job.progress}%` }} /></div> : null}
              </button>
              <div className="p-4">
                <p className="line-clamp-2 min-h-10 text-xs leading-5 text-black/70 dark:text-white/70">{job.error || job.prompt || t.image}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-black/40 dark:text-white/40"><span className="capitalize">{job.style} · {job.duration}s · {job.format}</span><span>{new Date(job.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</span></div>
                <div className="mt-3 flex gap-2 border-t border-black/[.07] pt-3 dark:border-white/10">
                  {job.status === "completed" && <><button onClick={() => setPlaying(job)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-lime/30 py-2 text-[11px] font-bold hover:bg-lime/50"><Film size={13} />Play</button><a href={`${job.videoUrl}`} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-black/5 py-2 text-[11px] font-bold hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"><ArrowDownToLine size={13} />{t.download}</a></>}
                  <button onClick={() => void removeJob(job)} disabled={job.status === "processing"} aria-label={t.delete} className="grid h-8 w-9 place-items-center rounded-lg text-black/40 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30 dark:text-white/40"><Trash2 size={14} /></button>
                </div>
              </div>
            </article>)}
          </div>}
        <div className="mt-8 flex items-start gap-2 rounded-2xl bg-black/[.03] px-4 py-3 text-[11px] leading-5 text-black/45 dark:bg-white/[.04] dark:text-white/45"><Sparkles size={14} className="mt-0.5 shrink-0" />{t.queueNote}</div>
      </section>

      {playing && <div role="dialog" aria-modal="true" onClick={() => setPlaying(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"><div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black"><button onClick={() => setPlaying(null)} className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white" aria-label="Close"><X size={18} /></button><video src={`${playing.videoUrl}?play=1`} controls autoPlay className="max-h-[85vh] w-full" /></div></div>}
    </main>
  );
}
