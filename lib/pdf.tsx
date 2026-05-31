import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditData {
  id: string;
  url: string;
  scoreGlobal: number;
  scoreSeo: number;
  scorePerf: number;
  scoreUx: number;
  scoreContent: number;
  scoreSecurity: number;
  scoreSocial: number;
  scoreCompetitor: number | null;
  competitorUrl: string | null;
  duration: number;
  createdAt: Date;
  results: {
    id: string;
    module: string;
    type: string;
    severity: string;
    label: string;
    value: string;
    impact: string;
    explanation: string | null;
    action: string | null;
    fix: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 85) return "#16a34a";
  if (score >= 70) return "#ca8a04";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

function severityColor(severity: string): string {
  if (severity === "critical") return "#dc2626";
  if (severity === "warning") return "#ea580c";
  return "#2563eb";
}

const MODULE_SCORES = [
  { key: "seo", label: "SEO", scoreKey: "scoreSeo" },
  { key: "performance", label: "Performance", scoreKey: "scorePerf" },
  { key: "ux", label: "UX", scoreKey: "scoreUx" },
  { key: "content", label: "Contenu", scoreKey: "scoreContent" },
  { key: "security", label: "Sécurité", scoreKey: "scoreSecurity" },
  { key: "social", label: "Social", scoreKey: "scoreSocial" },
] as const;

type ModuleScoreKey = (typeof MODULE_SCORES)[number]["scoreKey"];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#0a0a0a",
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1e40af",
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
  },
  subtitle: {
    fontSize: 11,
    color: "#475569",
    marginTop: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  url: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    maxWidth: "70%",
  },
  date: {
    fontSize: 10,
    color: "#64748b",
  },
  scoreSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  scoreLabel: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scoreValue: {
    fontSize: 56,
    fontFamily: "Helvetica-Bold",
  },
  modulesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    marginBottom: 28,
  },
  moduleCard: {
    width: "33.333%",
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  moduleCardInner: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  moduleLabel: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  moduleScore: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 12,
    marginTop: 8,
  },
  resultRow: {
    borderLeftWidth: 3,
    borderLeftColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  severityBadge: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginRight: 8,
    letterSpacing: 0.5,
  },
  resultLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    flex: 1,
  },
  resultExplanation: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
});

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function AuditPDFDocument({ audit }: { audit: AuditData }) {
  const criticals = audit.results.filter((r) => r.severity === "critical");
  const warnings = audit.results.filter((r) => r.severity === "warning");
  const displayResults = [...criticals, ...warnings].slice(0, 30);

  return (
    <Document title={`Rapport Mixea — ${audit.url}`} author="Mixea">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>Mixea</Text>
          <Text style={styles.subtitle}>Rapport d&apos;audit complet</Text>
        </View>

        {/* Infos */}
        <View style={styles.infoRow}>
          <Text style={styles.url}>{audit.url}</Text>
          <Text style={styles.date}>
            {new Date(audit.createdAt).toLocaleDateString("fr-FR")}
          </Text>
        </View>

        {/* Score global */}
        <View style={styles.scoreSection}>
          <Text style={styles.scoreLabel}>Score global</Text>
          <Text
            style={[
              styles.scoreValue,
              { color: scoreColor(audit.scoreGlobal) },
            ]}
          >
            {audit.scoreGlobal}/100
          </Text>
        </View>

        {/* Scores modules */}
        <View style={styles.modulesGrid}>
          {MODULE_SCORES.map(({ key, label, scoreKey }) => {
            const score = audit[scoreKey as ModuleScoreKey] as number;
            return (
              <View key={key} style={styles.moduleCard}>
                <View style={styles.moduleCardInner}>
                  <Text style={styles.moduleLabel}>{label}</Text>
                  <Text
                    style={[styles.moduleScore, { color: scoreColor(score) }]}
                  >
                    {score}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Résultats */}
        <Text style={styles.sectionTitle}>
          Problèmes détectés ({criticals.length} critical, {warnings.length}{" "}
          warning)
        </Text>
        {displayResults.map((result) => (
          <View key={result.id} style={styles.resultRow} wrap={false}>
            <View style={styles.resultHeader}>
              <Text
                style={[
                  styles.severityBadge,
                  { color: severityColor(result.severity) },
                ]}
              >
                {result.severity.toUpperCase()}
              </Text>
              <Text style={styles.resultLabel}>{result.label}</Text>
            </View>
            {result.explanation && (
              <Text style={styles.resultExplanation}>
                {result.explanation}
              </Text>
            )}
          </View>
        ))}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Généré par Mixea · mixea.io
        </Text>
      </Page>
    </Document>
  );
}
