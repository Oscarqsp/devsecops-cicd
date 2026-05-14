# Projet DevSecOps — Déploiement Terraform AWS

## 📌 Description

Ce projet déploie automatiquement une infrastructure AWS sécurisée avec Terraform comprenant :

* un VPC privé
* un subnet public
* un subnet privé
* une Internet Gateway
* une NAT Gateway
* des Security Groups
* 3 instances EC2 :

  * frontend (public)
  * backend (privé)
  * database (privé)

---

# ⚠️ Prérequis

## 1. Installer Terraform

Vérifier :

```bash
terraform -version
```

---

## 2. Installer AWS CLI

Vérifier :

```bash
aws --version
```

---

## 3. Configurer AWS SSO

Créer le profil AWS :

```bash
aws configure sso --profile devsecops-betsabee
```

Utiliser :

```text
SSO start URL : https://d-80676049e5.awsapps.com/start
SSO region    : eu-west-3
```

Puis sélectionner :

```text
Account ID : 712389998908
Role       : AdministratorAccess
```

Connexion AWS :

```bash
aws sso login --profile devsecops-betsabee
```

Vérification :

```bash
aws sts get-caller-identity --profile devsecops-betsabee
```

---

# 🔑 Clé SSH

La key pair AWS utilisée est :

```text
key-devsecops
```

Le fichier privé :

```text
key-devsecops.pem
```

doit être présent localement.

⚠️ Ne jamais publier le fichier `.pem`.

---

# 🌍 Récupérer son IP publique

Commande :

```bash
curl ifconfig.me
```

Exemple :

```text
78.240.12.139
```

L’adresse IP doit être utilisée avec `/32`.

Exemple :

```text
78.240.12.139/32
```

---

# 🚀 Déploiement de l’infrastructure

Initialisation Terraform :

```bash
terraform init
```

Validation :

```bash
terraform validate
```

Plan Terraform :

```bash
terraform plan -var="my_ip=78.240.12.139/32"
```

Déploiement :

```bash
terraform apply -var="my_ip=78.240.12.139/32"
```

Confirmer avec :

```text
yes
```

---

# 📡 Connexion SSH

## Frontend

```bash
ssh -i ~/key-devsecops.pem ubuntu@IP_FRONTEND
```

---

## Backend via frontend

```bash
ssh -i ~/key-devsecops.pem -o ProxyCommand="ssh -i ~/key-devsecops.pem -W %h:%p ubuntu@IP_FRONTEND" ubuntu@IP_BACKEND
```

---

# 🧹 Suppression de l’infrastructure

⚠️ Important pour éviter les coûts AWS (NAT Gateway).

Commande :

```bash
terraform destroy -var="my_ip=78.240.12.139/32"
```

Confirmer avec :

```text
yes
```

---

# 🔐 Sécurité

* frontend accessible uniquement en HTTP/HTTPS
* backend privé
* database privée
* SSH limité à l’adresse IP de l’utilisateur
* accès MariaDB limité au backend

---

# 📁 Fichiers importants

```text
provider.tf
variables.tf
main.tf
outputs.tf
```

---

# ⚠️ Ne pas partager

```text
terraform.tfstate
.terraform/
key-devsecops.pem
```

