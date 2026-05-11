# CI/CD DevSecOps - Automatisation & Sécurité

## Objectif
Ce repo met en place un pipeline CI/CD sécurisé pour le projet DevSecOps.
L'idée : à chaque fois qu'on pousse du code, le pipeline se déclenche automatiquement,
scanne les vulnérabilités, et déploie l'application sur le serveur AWS si tout est ok.

## Comment ça marche
1. Un développeur push du code sur la branche `main`
2. GitHub Actions déclenche automatiquement le pipeline
3. Le pipeline scanne les dépendances Node.js (npm audit)
4. Le pipeline scanne l'image Docker à la recherche de vulnérabilités (Trivy)
5. Si tout est ok → déploiement automatique sur l'EC2 AWS en SSH

## Sécurité des secrets
Aucune IP, mot de passe ou clé SSH n'est écrit dans le code.
Tout est stocké dans les GitHub Secrets (chiffrés et masqués) :
- `EC2_HOST` : adresse du serveur
- `EC2_USER` : utilisateur SSH
- `EC2_SSH_KEY` : clé privée SSH ( en attente )

## Stack utilisée
- GitHub Actions (CI/CD)
- Docker (conteneurisation)
- Trivy (scan de vulnérabilités)
- npm audit (scan des dépendances)
- AWS EC2 (serveur de déploiement)

## En attente
- Clé SSH `.pem` → B/A EC2_SSH_KEY c'est ok 
- Code source de l'app CRUD → E c'est en cours dokcer compose, il push son code bientot 

test
  
