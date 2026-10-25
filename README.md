---
title: Nono AI Video Studio
emoji: 🎬
colorFrom: lime
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Nono — AI video studio

[![Deploy on Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FNonocharmeur%2Fnono225)

Une application Next.js bilingue pour lancer des générations texte→vidéo ou image→vidéo, suivre leur état et gérer une galerie locale. Le moteur est interchangeable via l’interface `VideoProvider`; l’adaptateur Hugging Face est fourni.

> **Limites importantes :** ce projet n’héberge pas de modèle vidéo. Hugging Face Inference API n’offre pas nécessairement un quota gratuit permanent pour chaque modèle : l’accès, le temps d’attente et les limites dépendent du compte, du modèle et de la disponibilité du fournisseur. Une génération réelle nécessite `HF_TOKEN`, un modèle pris en charge et FFmpeg. L’application affiche une erreur explicite lorsque ces conditions ne sont pas remplies.

## Fonctionnalités

- Prompt texte ou import JPG/PNG/WebP, style, format et durée de 3 à 10 secondes.
- Amélioration de prompt déterministe et locale, sans appel à une API payante.
- File simple, états d’avancement, historique, lecture, téléchargement MP4 et suppression.
- Quota quotidien configurable (`DAILY_GENERATION_LIMIT`, 3 par défaut).
- Modération basique des descriptions en français et anglais.
- Filigrane facultatif, incrusté avec FFmpeg ; conversion au format et à la durée demandés.
- Interface responsive, mode sombre et libellés FR/EN.
- CI GitHub Actions avec contrôles TypeScript, lint et build de production à chaque push et pull request.

## Installation locale

Prérequis : Node.js 20 ou supérieur, npm et FFmpeg avec encodeur H.264 (`libx264`).

1. Cloner le dépôt et installer les dépendances :

   ```bash
   git clone https://github.com/Nonocharmeur/nono225.git
   cd nono225
   npm install
   ```

2. Copier `.env.example` vers `.env.local`, puis renseigner `HF_TOKEN`. Les noms des modèles sont configurables dans ce fichier.
3. Lancer le serveur :

   ```bash
   npm run dev
   ```

   Ouvrir [http://localhost:3000](http://localhost:3000).

Vérification avant déploiement :

```bash
npm run typecheck
npm run lint
npm run build
```

Les jobs sont stockés dans SQLite (`jobs.sqlite`) et les images/vidéos dans `DATA_DIR` (par défaut `./data`). Les vidéos ne sont pas écrites dans le dépôt. Le quota bascule à minuit UTC. Garder ce dossier sur un volume persistant et le sauvegarder.

## Configuration

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `HF_TOKEN` | — | Jeton Hugging Face du serveur ; ne jamais l’exposer côté navigateur. |
| `HF_TEXT_TO_VIDEO_MODEL` | `Wan-AI/Wan2.1-T2V-1.3B` | Modèle texte→vidéo disponible pour le compte. |
| `HF_IMAGE_TO_VIDEO_MODEL` | `stabilityai/stable-video-diffusion-img2vid-xt` | Modèle image→vidéo disponible pour le compte. |
| `DAILY_GENERATION_LIMIT` | `3` | Nombre maximal de demandes par adresse réseau et par jour. |
| `DATA_DIR` | `./data` | Dossier de persistance des jobs, images sources et MP4. |

Le quota est actuellement associé à l’adresse IP (hachée), et non à un compte authentifié. Plusieurs personnes derrière le même réseau partagent donc le quota ; il ne constitue pas une protection contre un utilisateur qui change d’adresse. En production, configurer le proxy de confiance pour qu’il réécrive `X-Forwarded-For` ; une authentification reste à ajouter avant une ouverture publique à grande échelle. Cette version utilise un processus Node persistant et un dossier local ; utiliser un seul processus applicatif par fichier SQLite.

L’API Inference ne fournit pas toujours une progression continue. L’interface affiche l’état de la tâche et la progression de la finalisation, mais ne prétend pas connaître les étapes internes du modèle. La génération asynchrone s’exécute dans le processus serveur : privilégier un service Node persistant, pas les fonctions serverless éphémères.

Le modèle SVD configuré par défaut n’utilise pas le prompt de mouvement pour l’entrée image ; il anime l’image selon ses propres capacités. Les images importées ne font pas l’objet d’une modération automatique. La modération des prompts est un filtre lexical de base, pas une garantie de sécurité.

## Déploiement gratuit (selon disponibilité des offres)

### Render (service Docker)

1. Cliquer sur le bouton **Deploy on Render** ci-dessus ou créer un **Blueprint** depuis ce dépôt.
2. Ajouter `HF_TOKEN` dans le formulaire Render lors de la création. Render demande cette valeur parce que le blueprint la définit avec `sync: false`.
3. Après le premier démarrage, vérifier `/api/jobs` dans les journaux Render.

Le blueprint choisit le plan gratuit et stocke les fichiers sous `/tmp/data` : la galerie et le quota sont réinitialisés lors d’un redémarrage/sommeil de l’instance. Ajouter un disque persistant et un service payant si l’historique doit survivre. Les plans et limites de Render peuvent évoluer. Un service en veille ne peut pas exécuter de tâches.

### Hugging Face Spaces

Un Space Docker peut héberger l’application : choisir Docker, configurer les secrets `HF_TOKEN` et `DATA_DIR=/data`, puis activer un stockage persistant si l’offre le permet. Le Dockerfile inclut FFmpeg. Le palier CPU gratuit peut ne pas suffire à exécuter les modèles vidéo : ce dépôt appelle Hugging Face Inference API, il n’exécute pas Wan/SVD localement. L’accès Inference et le stockage dépendent des quotas actuels du compte.

### Vercel

Le frontend Next.js peut être déployé sur Vercel, mais cette version n’est **pas prête pour un déploiement complet sur Vercel** : jobs en arrière-plan, FFmpeg et fichiers locaux nécessitent un processus Node persistant et un stockage partagé. Il faudrait remplacer l’index et le stockage par une base et un blob store externes, puis déplacer la file vers un worker persistant avant de l’utiliser en production sur Vercel.

## Arborescence

```text
app/
  api/jobs/             API de file et quota
  api/jobs/[id]/        Suppression d’une génération
  api/jobs/[id]/video/  Lecture et téléchargement du MP4
  globals.css
  layout.tsx
  page.tsx              Interface FR/EN
lib/
  jobs.ts               Persistance SQLite et quota
  moderation.ts         Filtre lexical de prompts
  request-security.ts   Protection same-origin des mutations
  video-processing.ts   Recadrage, durée et filigrane via FFmpeg
  video-provider.ts     Contrat VideoProvider + adaptateur Hugging Face
Dockerfile              Image Node.js avec FFmpeg
.env.example
```

## Améliorations possibles

- Authentification email/Google, quota par compte et stockage Supabase/S3.
- Worker persistant avec Redis/BullMQ, reprises après redémarrage et progression native du fournisseur.
- Modération image et modèle multilingue plus robuste.
- Adaptateurs dédiés selon les schémas de chaque modèle/provider Hugging Face.
- Ajout de contrôles de débit, nettoyage automatique et métriques de coûts/quota fournisseur.
