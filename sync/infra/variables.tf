variable "project_name" {
  type        = string
  description = "Name prefix for resources"
  default     = "barbershop-tags"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_profile" {
  type        = string
  description = "Optional AWS CLI profile (empty = default chain / env)"
  default     = ""
}

variable "schedule_expression" {
  type        = string
  description = "EventBridge schedule to start the weekly sync state machine"
  default     = "rate(7 days)"
}

variable "lambda_memory_mb" {
  type    = number
  default = 3008
}

variable "lambda_timeout_seconds" {
  type    = number
  default = 900
}

variable "image_tag" {
  type        = string
  description = "ECR image tag Terraform uses for the initial Lambda create (publish script updates later)"
  default     = "latest"
}

variable "origin_retry_interval_seconds" {
  type    = number
  default = 3600
}

variable "origin_retry_max_attempts" {
  type    = number
  default = 24
}

variable "enable_signed_media" {
  type        = bool
  description = "Optional CloudFront signed cookies (not implemented in v1 signer)"
  default     = false
}

variable "create_lambda" {
  type        = bool
  description = "Set false for ECR-only bootstrap before the first image push"
  default     = true
}
