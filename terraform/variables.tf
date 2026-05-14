variable "key_name" {
  description = "Nom de la paire de clés EC2"
  type        = string
  default     = "key-devsecops"
}

variable "my_ip" {
  description = "Adresse IP publique autorisée en SSH"
  type        = string
}
