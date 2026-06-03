import { CrmTask } from '../types/crmTask';

export function matchCrmTasksByName(
  tasks: CrmTask[],
  name: string,
): { exact: CrmTask[]; fuzzy: CrmTask[] } {
  const lower = name.toLowerCase();
  const exact = tasks.filter((t) => t.contact_name.toLowerCase() === lower);
  const fuzzy = tasks.filter(
    (t) => t.contact_name.toLowerCase().includes(lower) && t.contact_name.toLowerCase() !== lower,
  );
  return { exact, fuzzy };
}
