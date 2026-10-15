import "@/app/data/organization/actions";

declare module "@/app/data/organization/actions" {
  export function updateOrganizationBranding(input: {
    organizationId: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string | null;
  }): Promise<{ status: "success" | "error"; message: string; data?: unknown }>;
}
