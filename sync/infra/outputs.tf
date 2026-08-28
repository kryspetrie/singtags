output "aws_region" {
  value = var.aws_region
}

output "bucket_name" {
  value = aws_s3_bucket.mirror.id
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.mirror.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.mirror.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.sync.repository_url
}

output "ecr_repository_name" {
  value = aws_ecr_repository.sync.name
}

output "sync_lambda_name" {
  value = var.create_lambda ? aws_lambda_function.sync[0].function_name : null
}

output "sync_lambda_arn" {
  value = var.create_lambda ? aws_lambda_function.sync[0].arn : null
}

output "sync_lambda_alias" {
  value = var.create_lambda ? aws_lambda_alias.sync_live[0].arn : null
}

output "sync_state_machine_arn" {
  value = var.create_lambda ? aws_sfn_state_machine.weekly_sync[0].arn : null
}

output "image_uri_latest" {
  value = "${aws_ecr_repository.sync.repository_url}:latest"
}
