{{/*
Expand the name of the chart.
*/}}
{{- define "bws-vault-bridge.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "bws-vault-bridge.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "bws-vault-bridge.labels" -}}
helm.sh/chart: {{ include "bws-vault-bridge.name" . }}-{{ .Chart.Version }}
{{ include "bws-vault-bridge.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "bws-vault-bridge.selectorLabels" -}}
app.kubernetes.io/name: {{ include "bws-vault-bridge.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
