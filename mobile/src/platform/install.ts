// The phone app is already on the home screen; only the website offers to be added (install.web.ts).
export type InstallState = { installed:boolean; canPrompt:boolean; ios:boolean };
const installed:InstallState = { installed:true, canPrompt:false, ios:false };
export const useInstall = () => installed;
export async function promptInstall() { return false; }
