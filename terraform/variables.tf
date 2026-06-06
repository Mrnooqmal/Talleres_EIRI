variable "aws_region" {
  description = "AWS region (us-east-1 por restriccion de SCP en esta cuenta)"
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name tag for all resources"
  default     = "eiri-talleres"
}

variable "instance_type" {
  description = "EC2 instance type (t3.micro es free-tier eligible)"
  default     = "t3.micro"
}

variable "public_key_path" {
  description = "Ruta a la llave publica que se importa como key pair EC2"
  type        = string
  default     = "/home/adrean/aws/adrean_cchc.pub"
}
