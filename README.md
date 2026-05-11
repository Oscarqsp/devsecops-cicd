# CI/CD DevSecOps - Automatisation & Sécurité

## Objectif

Ce repo couvre la partie **Automatisation & Sécurité** du projet DevSecOps.
Un pipeline CI/CD se déclenche automatiquement à chaque push sur `main`,
scanne les vulnérabilités, gère le cycle de vie de l'instance EC2 et déploie
la stack applicative sur AWS.

## Pipeline — 5 jobs dans l'ordre

1. **Tests de sécurité** — `npm audit` sur les dépendances Node.js + scan Trivy sur l'image Docker
2. **Test Docker Compose** — démarrage de toute la stack en environnement isolé pour valider que les conteneurs fonctionnent
3. **Arrêt EC2** — arrêt contrôlé de l'instance AWS via CLI
4. **Démarrage EC2** — redémarrage propre de l'instance
5. **Déploiement** — connexion SSH, suppression du code existant, clonage propre du repo, relance de la stack

## Gestion des secrets

Aucune donnée sensible n'est écrite dans le code.
Tout est stocké dans les **GitHub Secrets** (chiffrés et masqués dans les logs) :

| Secret | Rôle |
|---|---|
| `EC2_HOST` | Adresse IP du serveur |
| `EC2_USER` | Utilisateur SSH |
| `EC2_SSH_KEY` | Clé privée SSH |
| `AWS_ACCESS_KEY_ID` | Credential AWS |
| `AWS_SECRET_ACCESS_KEY` | Credential AWS |
| `AWS_REGION` | Région AWS |
| `INSTANCE_ID` | Identifiant de l'instance EC2 |
| `MISTRAL_API_KEY` | Clé API Mistral |

## Stack utilisée

- GitHub Actions (CI/CD)
- Trivy (scan de vulnérabilités Docker)
- npm audit (scan des dépendances)
- AWS CLI (gestion EC2)
- Docker Compose (orchestration des conteneurs)
