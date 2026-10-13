'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  EyeIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { motionStorageKey } from '@/app/ui/dashboard/motion-preference';

type Settings = {
  name: string;
  email: string;
  preferredRoleTitle: string;
  reduceMotion: boolean;
};

type Notice = { message: string; type: 'success' | 'error' } | null;

const navigation = [
  { href: '#profile', text: 'Profile', icon: UserCircleIcon },
  { href: '#security', text: 'Security', icon: LockClosedIcon },
  { href: '#assessment', text: 'Assessment preferences', icon: Cog6ToothIcon },
  { href: '#privacy', text: 'Privacy & data', icon: ShieldCheckIcon },
  { href: '#notifications', text: 'Notifications', icon: BellIcon },
  { href: '#accessibility', text: 'Accessibility', icon: EyeIcon },
];

const inputStyle = 'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200';
const buttonStyle = 'inline-flex min-h-10 items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60';

function Panel({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="space-y-5 px-5 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function Alert({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const success = notice.type === 'success';
  return (
    <div role={success ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
      {success ? <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{notice.message}</span>
    </div>
  );
}

async function jsonResponse(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request failed.');
  return result;
}

export default function SettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [securityNotice, setSecurityNotice] = useState<Notice>(null);
  const [appearanceNotice, setAppearanceNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/settings', { cache: 'no-store' })
      .then(jsonResponse)
      .then((data: Settings) => {
        if (!active) return;
        setSettings(data);
        setName(data.name);
        setRole(data.preferredRoleTitle);
        setReduceMotion(data.reduceMotion);
        try {
          localStorage.setItem(motionStorageKey, String(data.reduceMotion));
          window.dispatchEvent(new Event('projectgreat:motion-changed'));
        } catch { /* Local storage can be blocked. */ }
      })
      .catch((error) => { if (active) setLoadingError(error instanceof Error ? error.message : 'Failed to load settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileNotice(null);
    setBusy('profile');
    try {
      const result = await jsonResponse(await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'profile', name, preferredRoleTitle: role }),
      }));
      setName(result.name);
      setRole(result.preferredRoleTitle);
      setSettings((previous) => previous && { ...previous, name: result.name, preferredRoleTitle: result.preferredRoleTitle });
      setProfileNotice({ type: 'success', message: 'Profile details saved.' });
    } catch (error) {
      setProfileNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not save profile.' });
    } finally { setBusy(null); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityNotice(null);
    if (newPassword !== confirmPassword) {
      setSecurityNotice({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setBusy('password');
    try {
      await jsonResponse(await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurityNotice({ type: 'success', message: 'Password updated. Use your new password next time you sign in.' });
    } catch (error) {
      setSecurityNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not update password.' });
    } finally { setBusy(null); }
  }

  async function saveAppearance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppearanceNotice(null);
    setBusy('appearance');
    try {
      await jsonResponse(await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'appearance', reduceMotion }),
      }));
      setSettings((previous) => previous && { ...previous, reduceMotion });
      try {
        localStorage.setItem(motionStorageKey, String(reduceMotion));
        window.dispatchEvent(new Event('projectgreat:motion-changed'));
      } catch { /* Preferences remain stored in the database. */ }
      setAppearanceNotice({ type: 'success', message: 'Accessibility preference saved.' });
    } catch (error) {
      setAppearanceNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not save preference.' });
    } finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-7 pb-14">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Your account</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Settings</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">Update your profile, protect your account, and manage your career information.</p>
      </header>
      {loading ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-slate-600"><ArrowPathIcon className="h-5 w-5 animate-spin" /> Loading your settings…</div>
      ) : loadingError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{loadingError}</div>
      ) : settings ? (
        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="h-fit rounded-xl border border-slate-200 bg-white p-2 lg:sticky lg:top-3">
            {navigation.map(({ href, text, icon: Icon }) => (
              <a key={href} href={href} className="flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium text-slate-600 hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400">
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> {text}
              </a>
            ))}
          </nav>
          <div className="min-w-0 space-y-6">
            <Panel id="profile" title="Profile & account" description="The details associated with your ProjectGreat account.">
              <form onSubmit={saveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="settings-name">Display name</label>
                  <input id="settings-name" autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputStyle} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="settings-email">Sign-in email</label>
                  <input id="settings-email" type="email" readOnly value={settings.email} className={`${inputStyle} bg-slate-50 text-slate-500`} />
                  <p className="mt-1 text-xs text-slate-500">Email changes require a verified account recovery flow and are not available here yet.</p>
                </div>
                <Alert notice={profileNotice} />
                <button disabled={busy !== null} className={buttonStyle} type="submit">{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
              </form>
            </Panel>
            <Panel id="security" title="Password & security" description="Your password is never displayed or returned by the settings API.">
              <form onSubmit={savePassword} className="space-y-4">
                <div><label className="block text-sm font-semibold text-slate-700" htmlFor="current-password">Current password</label><input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputStyle} /></div>
                <div><label className="block text-sm font-semibold text-slate-700" htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputStyle} /><p className="mt-1 text-xs text-slate-500">Use at least 12 characters.</p></div>
                <div><label className="block text-sm font-semibold text-slate-700" htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputStyle} /></div>
                <Alert notice={securityNotice} />
                <button disabled={busy !== null} className={buttonStyle} type="submit">{busy === 'password' ? 'Updating…' : 'Change password'}</button>
                <p className="text-xs leading-5 text-slate-500">Changing your password does not currently revoke other signed-in sessions.</p>
              </form>
            </Panel>
            <Panel id="assessment" title="Assessment preferences" description="Personalise how you prepare for career assessments.">
              <form onSubmit={saveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="target-role">Preferred target role</label>
                  <input id="target-role" maxLength={160} value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Senior Full-Stack Engineer" className={inputStyle} />
                  <p className="mt-1 text-xs leading-5 text-slate-500">Stored on your account. Existing CV/no-CV assessment forms still ask for the role explicitly.</p>
                </div>
                <Alert notice={profileNotice} />
                <button disabled={busy !== null} className={buttonStyle} type="submit">{busy === 'profile' ? 'Saving…' : 'Save preference'}</button>
              </form>
            </Panel>
            <Panel id="privacy" title="Privacy & career data" description="Review and export your recorded career information.">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div><h3 className="text-sm font-semibold text-slate-800">Download career data</h3><p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Download a JSON snapshot of your assessments, roles, capabilities, knowledge, and evidence.</p></div>
                <a href="/api/settings/export" download className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50"><ArrowDownTrayIcon className="h-4 w-4" /> Export JSON</a>
              </div>
              <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">This is a career snapshot rather than a complete personal-data export. Save the file securely: it contains personal career information.</p>
              <div className="flex flex-wrap gap-4 text-sm font-semibold text-violet-700">
                <Link href="/dashboard/evidence" className="hover:underline">Review evidence →</Link>
                <Link href="/dashboard/knowledge" className="hover:underline">Review knowledge →</Link>
                <Link href="/dashboard/capabilities" className="hover:underline">Review capabilities →</Link>
              </div>
              <p className="text-xs leading-5 text-slate-500">Account and assessment deletion are not yet self-service. No deletion action is offered until safe cascading deletion and audit checks are implemented.</p>
            </Panel>
            <Panel id="notifications" title="Notifications" description="Information about communication preferences.">
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4"><BellIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><div><p className="text-sm font-semibold text-slate-800">Email assessment reminders are not configured</p><p className="mt-1 text-sm leading-6 text-slate-500">There is currently no notification delivery service in ProjectGreat, so no email toggle is shown until it can be honoured.</p></div></div>
            </Panel>
            <Panel id="accessibility" title="Appearance & accessibility" description="Make dashboard motion more comfortable across your devices.">
              <form onSubmit={saveAppearance} className="space-y-4">
                <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4" htmlFor="reduce-motion">
                  <span><span className="block text-sm font-semibold text-slate-800">Reduce interface motion</span><span className="mt-1 block text-xs leading-5 text-slate-500">Minimise dashboard animations and transitions. We also respect your system reduced-motion preference.</span></span>
                  <input id="reduce-motion" type="checkbox" className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-violet-700 focus:ring-violet-600" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} />
                </label>
                <Alert notice={appearanceNotice} />
                <button disabled={busy !== null} className={buttonStyle} type="submit">{busy === 'appearance' ? 'Saving…' : 'Save appearance'}</button>
              </form>
            </Panel>
            <footer className="flex items-center gap-2 text-xs text-slate-500"><DocumentTextIcon className="h-4 w-4" /> Your changes are saved to your ProjectGreat account unless otherwise noted.</footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
