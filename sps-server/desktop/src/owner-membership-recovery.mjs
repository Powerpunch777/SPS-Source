export async function recoverSpsTechnicalMembership({
  companyId, listMemberships, createInvitation, acceptInvitation, assertCurrent,
}) {
  if (typeof companyId !== "string" || !companyId.trim()
    || [listMemberships, createInvitation, acceptInvitation, assertCurrent].some(value => typeof value !== "function")) {
    throw new TypeError("Technical membership recovery requires a Workspace and scoped Identity operations.");
  }
  const scoped = async operation => {
    assertCurrent();
    try {
      const result = await operation();
      assertCurrent();
      return result;
    } catch (error) {
      assertCurrent();
      throw error;
    }
  };
  const read = async () => {
    const companies = await scoped(listMemberships);
    if (!Array.isArray(companies) || companies.some(company => !company || typeof company.id !== "string")) {
      throw new Error("SPS could not verify the current Identity memberships.");
    }
    return companies;
  };
  const includesTarget = companies => companies.some(company => company.id === companyId);
  const existing = await read();
  if (includesTarget(existing)) return { recovered: false, companies: existing };

  const invitation = await scoped(createInvitation);
  if (typeof invitation?.token !== "string" || !invitation.token.trim()) {
    throw new Error("SPS Owner Host could not recover access: no membership invitation was returned.");
  }
  let accepted;
  try {
    accepted = await scoped(() => acceptInvitation(invitation.token));
  } catch (error) {
    // A concurrent recovery may have won. A conflict alone is not proof of
    // access: verify this exact Workspace through the real Identity session.
    if (error?.status !== 409) throw error;
    const companies = await read();
    if (!includesTarget(companies)) throw error;
    return { recovered: true, companies };
  }
  if (accepted?.status !== "approved") {
    throw new Error("SPS Identity did not approve the membership recovery.");
  }
  const companies = await read();
  if (!includesTarget(companies)) {
    throw new Error("SPS could not verify the recovered Workspace membership.");
  }
  return { recovered: true, companies };
}
