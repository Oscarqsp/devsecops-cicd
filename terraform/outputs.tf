output "frontend_public_ip" {
  value = aws_instance.frontend.public_ip
}

output "ssh_frontend" {
  value = "ssh -i ~/key-devsecops.pem ubuntu@${aws_instance.frontend.public_ip}"
}

