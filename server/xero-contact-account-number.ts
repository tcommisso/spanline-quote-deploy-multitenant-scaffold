import {
  createXeroContact,
  getXeroContacts,
  updateXeroContact,
  type XeroContact,
} from "./xero-client";

type XeroRouting = {
  connectionId: number;
};

export type XeroContactWriteResult = {
  contact: XeroContact;
  reusedExistingAccountNumber: boolean;
  omittedDuplicateAccountNumber: boolean;
};

function xeroWhereString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cleanAccountNumber(value: unknown) {
  const accountNumber = String(value || "").trim();
  return accountNumber || null;
}

function withoutBlankAccountNumber(contact: Partial<XeroContact>) {
  const copy: Partial<XeroContact> = { ...contact };
  const accountNumber = cleanAccountNumber(copy.AccountNumber);
  if (accountNumber) {
    copy.AccountNumber = accountNumber;
  } else {
    delete copy.AccountNumber;
  }
  return copy;
}

function isDuplicateAccountNumberError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Account Number already exists/i.test(message);
}

export async function findXeroContactByAccountNumber(
  accountNumber: string | null | undefined,
  routing: XeroRouting,
) {
  const clean = cleanAccountNumber(accountNumber);
  if (!clean) return null;

  const result = await getXeroContacts({
    where: `AccountNumber=="${xeroWhereString(clean)}"`,
  }, routing);
  return result.Contacts?.[0] || null;
}

export async function updateXeroContactPreservingAccountNumber(
  contactId: string,
  contact: Partial<XeroContact>,
  routing: XeroRouting,
): Promise<XeroContactWriteResult> {
  const contactData = withoutBlankAccountNumber(contact);
  const accountNumber = cleanAccountNumber(contactData.AccountNumber);

  if (accountNumber) {
    const existing = await findXeroContactByAccountNumber(accountNumber, routing).catch(() => null);
    if (existing?.ContactID && existing.ContactID !== contactId) {
      return {
        contact: existing,
        reusedExistingAccountNumber: true,
        omittedDuplicateAccountNumber: false,
      };
    }
  }

  try {
    const result = await updateXeroContact(contactId, contactData, routing);
    return {
      contact: result.Contacts[0],
      reusedExistingAccountNumber: false,
      omittedDuplicateAccountNumber: false,
    };
  } catch (error) {
    if (!accountNumber || !isDuplicateAccountNumberError(error)) throw error;

    const existing = await findXeroContactByAccountNumber(accountNumber, routing).catch(() => null);
    if (existing?.ContactID) {
      return {
        contact: existing,
        reusedExistingAccountNumber: existing.ContactID !== contactId,
        omittedDuplicateAccountNumber: false,
      };
    }

    const retryData = { ...contactData };
    delete retryData.AccountNumber;
    const result = await updateXeroContact(contactId, retryData, routing);
    return {
      contact: result.Contacts[0],
      reusedExistingAccountNumber: false,
      omittedDuplicateAccountNumber: true,
    };
  }
}

export async function createXeroContactReusingAccountNumber(
  contact: Partial<XeroContact>,
  routing: XeroRouting,
): Promise<XeroContactWriteResult> {
  const contactData = withoutBlankAccountNumber(contact);
  const accountNumber = cleanAccountNumber(contactData.AccountNumber);

  if (accountNumber) {
    const existing = await findXeroContactByAccountNumber(accountNumber, routing).catch(() => null);
    if (existing?.ContactID) {
      return {
        contact: existing,
        reusedExistingAccountNumber: true,
        omittedDuplicateAccountNumber: false,
      };
    }
  }

  try {
    const result = await createXeroContact(contactData, routing);
    return {
      contact: result.Contacts[0],
      reusedExistingAccountNumber: false,
      omittedDuplicateAccountNumber: false,
    };
  } catch (error) {
    if (!accountNumber || !isDuplicateAccountNumberError(error)) throw error;

    const existing = await findXeroContactByAccountNumber(accountNumber, routing).catch(() => null);
    if (existing?.ContactID) {
      return {
        contact: existing,
        reusedExistingAccountNumber: true,
        omittedDuplicateAccountNumber: false,
      };
    }

    const retryData = { ...contactData };
    delete retryData.AccountNumber;
    const result = await createXeroContact(retryData, routing);
    return {
      contact: result.Contacts[0],
      reusedExistingAccountNumber: false,
      omittedDuplicateAccountNumber: true,
    };
  }
}
