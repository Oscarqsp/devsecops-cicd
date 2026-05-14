output "frontend_public_ip" {
  value = aws_instance.devsecops.public_ip
}

output "ssh_frontend" {
  value = "ssh -i ~/key-devsecops.pem ubuntu@${aws_instance.frontend.public_ip}"
}

output "ssh_backend_via_frontend" {
  value = "ssh -i ~/key-devsecops.pem -o ProxyCommand=\"ssh -i ~/key-devsecops.pem -W %h:%p ubuntu@${aws_instance.frontend.public_ip}\" ubuntu@${aws_instance.backend.private_ip}"
}
