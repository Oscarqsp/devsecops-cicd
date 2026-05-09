# devsecops-cicd
Pipeline CI/CD DevSecOps - Tests de sécurité intégrés et gestion des secrets
# Pipeline CI/CD DevSecOps 🔐

## C'est quoi ce repo ?
Ma partie du projet DevSecOps : automatisation et sécurité.
Le pipeline se déclenche automatiquement à chaque push et fait les scans de sécurité.

## Lien du repo
https://github.com/Oscarqsp/devsecops-cicd

## Ce qui est en place
- Pipeline GitHub Actions (CI/CD)
- Scan des dépendances npm (npm audit)
- Scan de l'image Docker (Trivy)
- Gestion des secrets chiffrés (EC2_HOST, EC2_USER, EC2_SSH_KEY)
- Job de déploiement automatique sur l'EC2 (en attente de la clé SSH)

## Ce qu'il me manque
- La clé SSH `.pem` pour activer le déploiement automatique sur l'EC2
→ **B ou A : envoyez-moi le fichier .pem**

## Ce que j'attends de l'équipe
- **E** : le lien GitHub de l'app CRUD pour brancher le pipeline dessus
- **B / A** : la clé SSH `.pem` pour finaliser le déploiement

## Comment voir le pipeline tourner
1. Aller dans l'onglet **Actions** du repo
2. Cliquer sur le dernier run
3. Voir les logs des scans de sécurité en temps réel
