import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { useTranslations } from "next-intl";
import { PRODUCT_NAME } from "@/lib/brand";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("creer_un_espace_product", { product: PRODUCT_NAME }) };
}

export default function SignUpPage() {
  const t = useTranslations("auth.signup");
  return (
    <AuthShell
      title={t("creer_un_espace_clozado")}
      description={t("ton_espace_est_isole_tes_affaires_b093")}
      footer={
        <>
          {t.rich("tu_as_deja_un_espace_se_6820", { link: (chunks) => <Link href="/login"
            className="font-medium text-foreground underline underline-offset-4">{chunks}</Link> })}
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
