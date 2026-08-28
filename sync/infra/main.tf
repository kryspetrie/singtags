data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name       = var.project_name
  ecr_url    = aws_ecr_repository.sync.repository_url
  image_uri  = "${local.ecr_url}:${var.image_tag}"
}

# -----------------------------------------------------------------------------
# S3 (private) + CloudFront OAC
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "mirror" {
  bucket_prefix = "${local.name}-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "mirror" {
  bucket                  = aws_s3_bucket.mirror.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "mirror" {
  bucket = aws_s3_bucket.mirror.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "mirror" {
  name                              = "${local.name}-oac"
  description                       = "OAC for ${local.name} mirror bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "mirror" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name} static mirror"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.mirror.bucket_regional_domain_name
    origin_id                = "s3-mirror"
    origin_access_control_id = aws_cloudfront_origin_access_control.mirror.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-mirror"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 86400
  }

  ordered_cache_behavior {
    path_pattern           = "/tags/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-mirror"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 86400
    default_ttl = 604800
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "mirror_bucket" {
  statement {
    sid     = "AllowCloudFrontOAC"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.mirror.arn}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.mirror.arn]
    }
  }

  statement {
    sid = "AllowSyncLambda"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.mirror.arn,
      "${aws_s3_bucket.mirror.arn}/*",
    ]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.lambda_sync.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "mirror" {
  bucket = aws_s3_bucket.mirror.id
  policy = data.aws_iam_policy_document.mirror_bucket.json
}

# -----------------------------------------------------------------------------
# ECR
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "sync" {
  name                 = "${local.name}-sync"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "sync" {
  repository = aws_ecr_repository.sync.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# IAM — Lambda
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_sync" {
  name               = "${local.name}-sync-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_sync.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_sync" {
  statement {
    sid = "S3Mirror"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.mirror.arn,
      "${aws_s3_bucket.mirror.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_sync" {
  name   = "${local.name}-sync-lambda"
  role   = aws_iam_role.lambda_sync.id
  policy = data.aws_iam_policy_document.lambda_sync.json
}

# -----------------------------------------------------------------------------
# Lambda (container)
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "sync" {
  count = var.create_lambda ? 1 : 0

  function_name = "${local.name}-sync"
  role          = aws_iam_role.lambda_sync.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds
  architectures = ["x86_64"]

  environment {
    variables = {
      S3_BUCKET                     = aws_s3_bucket.mirror.id
      MIRROR_ROOT                   = "/tmp/mirror"
      ASR_ENABLED                   = "1"
      ASR_MODEL                     = "small.en"
      ASR_BEAM_SIZE                 = "1"
      ASR_MIN_REMAINING_SECONDS     = "90"
      ORIGIN_RETRY_INTERVAL_SECONDS = tostring(var.origin_retry_interval_seconds)
      ORIGIN_RETRY_MAX_ATTEMPTS     = tostring(var.origin_retry_max_attempts)
      HF_HOME                       = "/opt/hf-cache"
      XDG_CACHE_HOME                = "/opt/hf-cache"
    }
  }

  # Image updates are done by infra/scripts/lambda_publish.sh
  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_iam_role_policy.lambda_sync,
  ]
}

resource "aws_lambda_alias" "sync_live" {
  count = var.create_lambda ? 1 : 0

  name             = "live"
  function_name    = aws_lambda_function.sync[0].function_name
  function_version = "$LATEST"

  lifecycle {
    ignore_changes = [function_version]
  }
}

# -----------------------------------------------------------------------------
# Step Functions + EventBridge
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${local.name}-sync-sfn"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

data "aws_iam_policy_document" "sfn" {
  count = var.create_lambda ? 1 : 0

  statement {
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.sync[0].arn,
      "${aws_lambda_function.sync[0].arn}:*",
      aws_lambda_alias.sync_live[0].arn,
    ]
  }
}

resource "aws_iam_role_policy" "sfn" {
  count = var.create_lambda ? 1 : 0

  name   = "${local.name}-sync-sfn"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn[0].json
}

resource "aws_sfn_state_machine" "weekly_sync" {
  count = var.create_lambda ? 1 : 0

  name     = "${local.name}-weekly-sync"
  role_arn = aws_iam_role.sfn.arn
  # Invoke the versioned "live" alias so publish scripts take effect immediately
  definition = templatefile("${path.module}/statemachine/weekly_sync.asl.json", {
    SyncLambdaArn = aws_lambda_alias.sync_live[0].arn
  })
}

data "aws_iam_policy_document" "events_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "events" {
  count = var.create_lambda ? 1 : 0

  name               = "${local.name}-sync-events"
  assume_role_policy = data.aws_iam_policy_document.events_assume.json
}

data "aws_iam_policy_document" "events" {
  count = var.create_lambda ? 1 : 0

  statement {
    actions   = ["states:StartExecution"]
    resources = [aws_sfn_state_machine.weekly_sync[0].arn]
  }
}

resource "aws_iam_role_policy" "events" {
  count = var.create_lambda ? 1 : 0

  name   = "${local.name}-sync-events"
  role   = aws_iam_role.events[0].id
  policy = data.aws_iam_policy_document.events[0].json
}

resource "aws_cloudwatch_event_rule" "weekly" {
  count = var.create_lambda ? 1 : 0

  name                = "${local.name}-weekly-sync"
  description         = "Start weekly tags sync state machine"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "weekly" {
  count = var.create_lambda ? 1 : 0

  rule      = aws_cloudwatch_event_rule.weekly[0].name
  target_id = "WeeklySyncStateMachine"
  arn       = aws_sfn_state_machine.weekly_sync[0].arn
  role_arn  = aws_iam_role.events[0].arn

  input = jsonencode({
    attempt = 1
    limit   = 0
  })
}
