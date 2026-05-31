import Link from "next/link";
import HeroForm from "@/components/landing/HeroForm";

const TICKER_KEYWORDS = [
  "SEO Technique", "Core Web Vitals", "Accessibilité", "Sécurité HTTP",
  "Schema.org", "Open Graph", "Mots-clés", "Liens brisés",
  "Performance mobile", "Headers manquants", "Canonical", "Robots.txt",
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Entrez votre URL",
    description: "Collez l'URL de votre site. Ajoutez optionnellement l'URL d'un concurrent pour une comparaison directe.",
  },
  {
    step: "02",
    title: "Audit en 15 secondes",
    description: "6 modules analysés en parallèle : SEO, Performance, UX, Contenu, Sécurité et Présence sociale.",
  },
  {
    step: "03",
    title: "Corrections IA générées",
    description: "Claude analyse vos problèmes et génère des corrections concrètes prêtes à copier-coller.",
  },
  {
    step: "04",
    title: "Suivez votre progression",
    description: "Relancez des audits régulièrement et suivez l'évolution de votre score dans le temps.",
  },
];

const COMPARISON = [
  { feature: "Audit SEO technique", mixea: true, semrush: true, gtmetrix: false },
  { feature: "Core Web Vitals réels", mixea: true, semrush: false, gtmetrix: true },
  { feature: "Audit sécurité (headers)", mixea: true, semrush: false, gtmetrix: false },
  { feature: "Corrections IA prêtes à copier", mixea: true, semrush: false, gtmetrix: false },
  { feature: "Comparaison concurrent", mixea: true, semrush: true, gtmetrix: false },
  { feature: "Audit contenu + keyword", mixea: true, semrush: true, gtmetrix: false },
  { feature: "Présence sociale", mixea: true, semrush: false, gtmetrix: false },
  { feature: "Export PDF", mixea: true, semrush: true, gtmetrix: true },
  { feature: "Prix mensuel", mixea: "$19", semrush: "$130+", gtmetrix: "$22" },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Pour découvrir Mixea",
    features: [
      "3 audits / mois",
      "1 domaine",
      "Score global + 5 problèmes Critical",
      "Sans corrections IA",
    ],
    cta: "Commencer gratuitement",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/mois",
    description: "Pour les sites en croissance",
    features: [
      "20 audits / mois",
      "5 domaines",
      "Rapport complet 6 modules",
      "Corrections IA complètes",
      "Comparaison 1 concurrent",
      "Export PDF + lien partage",
      "Historique + graphique",
    ],
    cta: "Commencer avec Starter",
    href: "/sign-up",
    highlight: true,
    badge: "Le plus populaire",
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mois",
    description: "Pour les agences et pros",
    features: [
      "Audits illimités",
      "Domaines illimités",
      "Jusqu'à 3 concurrents",
      "Accès API REST",
      "Rapport marque blanche",
      "Corrections auto WordPress (V2)",
      "Support prioritaire < 24h",
    ],
    cta: "Commencer avec Pro",
    href: "/sign-up",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Quelle est la différence avec Semrush ou Screaming Frog ?",
    a: "Mixea combine en un seul outil ce que Semrush (SEO), GTmetrix (performance), et des outils de sécurité font séparément. Et contrairement à eux, Mixea génère des corrections IA concrètes et prêtes à copier — pas juste une liste de problèmes.",
  },
  {
    q: "L'audit prend combien de temps ?",
    a: "Moins de 15 secondes. Les 6 modules sont analysés en parallèle. La comparaison avec un concurrent double le temps (2 audits simultanés).",
  },
  {
    q: "Faut-il installer quoi que ce soit ?",
    a: "Non. Mixea fonctionne entièrement depuis le navigateur. Entrez une URL, l'audit se lance immédiatement.",
  },
  {
    q: "Les données de mon site sont-elles stockées ?",
    a: "Seuls les résultats d'audit (scores et problèmes détectés) sont stockés pour vous permettre de suivre votre progression. Aucune donnée de contenu n'est conservée.",
  },
  {
    q: "Puis-je auditer n'importe quel site ?",
    a: "Oui, tout site web public. Les URLs internes (localhost, IPs privées) sont bloquées pour des raisons de sécurité.",
  },
  {
    q: "Qu'est-ce que les corrections IA ?",
    a: "Après l'audit, Claude (Anthropic) analyse chaque problème détecté et génère une explication simple, l'impact concret, et les étapes précises pour corriger — voire le code exact à copier-coller (title, meta, headers de sécurité, Schema.org...).",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* NAV */}
      <nav className="border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">Mixea</span>
          <div className="flex items-center gap-6">
            <a href="#pricing" className="text-sm text-white/50 hover:text-white transition-colors">Tarifs</a>
            <Link href="/sign-in" className="text-sm text-white/50 hover:text-white transition-colors">Connexion</Link>
            <Link href="/sign-up" className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors">
              Commencer
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-6 pt-24 pb-16 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/60">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Audit complet en &lt; 15 secondes
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight">
            L'audit de site web<br />
            <span className="text-white/40">le plus complet du marché</span>
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            SEO · Performance · UX · Sécurité · Contenu · Réseaux sociaux.<br />
            Corrections IA prêtes à copier-coller. Comparaison concurrent en temps réel.
          </p>
          <div className="flex justify-center">
            <HeroForm />
          </div>
          <p className="text-sm text-white/30">Gratuit · Sans carte de crédit · Résultats en 15s</p>
        </div>
      </section>

      {/* TICKER */}
      <div className="border-y border-white/5 py-4 overflow-hidden">
        <div className="flex gap-8 animate-[ticker_20s_linear_infinite] whitespace-nowrap">
          {[...TICKER_KEYWORDS, ...TICKER_KEYWORDS].map((kw, i) => (
            <span key={i} className="text-sm text-white/30 shrink-0">
              <span className="text-white/15 mr-4">·</span>{kw}
            </span>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Comment ça fonctionne</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {HOW_IT_WORKS.map(({ step, title, description }) => (
              <div key={step} className="space-y-4">
                <span className="text-4xl font-bold text-white/10">{step}</span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="px-6 py-24 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Mixea vs les autres</h2>
          <p className="text-center text-white/50 mb-12">Tout ce dont vous avez besoin, dans un seul outil.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 pr-8 text-white/50 font-normal">Fonctionnalité</th>
                  <th className="py-3 px-6 font-bold text-white">Mixea</th>
                  <th className="py-3 px-6 text-white/40 font-normal">Semrush</th>
                  <th className="py-3 px-6 text-white/40 font-normal">GTmetrix</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(({ feature, mixea, semrush, gtmetrix }) => (
                  <tr key={feature} className="border-b border-white/5">
                    <td className="py-3 pr-8 text-white/70">{feature}</td>
                    <td className="py-3 px-6 text-center">
                      {typeof mixea === "boolean"
                        ? mixea ? <span className="text-green-400">✓</span> : <span className="text-white/20">—</span>
                        : <span className="font-bold text-green-400">{mixea}</span>}
                    </td>
                    <td className="py-3 px-6 text-center text-white/40">
                      {typeof semrush === "boolean"
                        ? semrush ? "✓" : "—"
                        : semrush}
                    </td>
                    <td className="py-3 px-6 text-center text-white/40">
                      {typeof gtmetrix === "boolean"
                        ? gtmetrix ? "✓" : "—"
                        : gtmetrix}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Tarifs simples</h2>
          <p className="text-center text-white/50 mb-16">Commencez gratuitement. Passez à un plan supérieur quand vous en avez besoin.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border space-y-6 ${
                  plan.highlight
                    ? "bg-white/10 border-white/30"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    {plan.highlight && "badge" in plan && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-white text-black font-medium">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 text-sm">{plan.description}</p>
                </div>
                <div>
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-white/40 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                      <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block w-full py-3 rounded-xl text-center text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-24 bg-white/[0.02]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Questions fréquentes</h2>
          <div className="space-y-8">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="border-b border-white/10 pb-8">
                <h3 className="font-semibold mb-3">{q}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-6 py-24">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <h2 className="text-4xl font-bold">Prêt à optimiser votre site ?</h2>
          <p className="text-white/50 text-lg">Lancez votre premier audit gratuit maintenant. Résultats en 15 secondes.</p>
          <div className="flex justify-center">
            <HeroForm />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-white/30">
          <span className="font-bold text-white/50">Mixea</span>
          <span>© {new Date().getFullYear()} Mixea. Tous droits réservés.</span>
        </div>
      </footer>
    </div>
  );
}
