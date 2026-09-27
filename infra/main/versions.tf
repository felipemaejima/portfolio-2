terraform {
  required_version = ">= 1.16"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  # Bucket comes from the bootstrap stack at `make tf-init` (-backend-config), since backends can't use variables.
  # use_lockfile: native S3 locking (Terraform >= 1.10) — no DynamoDB table needed.
  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

# Single region: cheapest, and certificates used by CloudFront must live in us-east-1 anyway.
provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { project = var.project, env = var.environment, managed-by = "terraform" }
  }
}
