output "cluster_name" {
  value = google_container_cluster.ci.name
}

output "cluster_endpoint" {
  value     = google_container_cluster.ci.endpoint
  sensitive = true
}

output "cluster_ca_certificate" {
  value     = google_container_cluster.ci.master_auth[0].cluster_ca_certificate
  sensitive = true
}
