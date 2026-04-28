variable "project_id" {
  type    = string
  default = "predict-alpha-4ed0c"
}

variable "region" {
  type    = string
  default = "us-west1"
}

variable "image_tag" {
  type        = string
  description = "Immutable release tag e.g. v1.2.3"
}
