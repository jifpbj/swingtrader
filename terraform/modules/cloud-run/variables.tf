variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "service_name" {
  type = string
}

variable "image" {
  type = string
}

variable "app_env" {
  type = string
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "secret_refs" {
  description = "Map of env var name to { secret_id }"
  type        = map(object({ secret_id = string }))
  default     = {}
}
