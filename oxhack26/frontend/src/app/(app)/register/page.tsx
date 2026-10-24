import type { Metadata } from "next";

import { RegisterForm } from "~/components/module/register/register-form";
import { SectionHeader } from "~/components/module/section-header";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <div className="py-12 md:py-16">
      <SectionHeader
        title="Register"
        subtitle="It takes about two minutes"
        className="mb-10 px-8 md:px-10 lg:px-12"
      />
      <RegisterForm />
    </div>
  );
}
