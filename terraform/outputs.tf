output "public_ip" {
  value       = aws_eip.eiri.public_ip
  description = "IP del servidor"
}

output "url" {
  value       = "http://${aws_eip.eiri.public_ip}"
  description = "URL directa por IP (sin dominio)"
}

output "ssh_command" {
  value       = "ssh -i ~/.ssh/<tu-key>.pem ubuntu@${aws_eip.eiri.public_ip}"
  description = "Comando para conectarse al servidor"
}

output "s3_bucket" {
  value       = aws_s3_bucket.uploads.bucket
  description = "Bucket de subidas"
}

output "cloudfront_url" {
  value       = "https://${aws_cloudfront_distribution.uploads.domain_name}"
  description = "CDN que sirve las imagenes subidas"
}
