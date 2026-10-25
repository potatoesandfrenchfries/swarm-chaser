import { useEffect, useState } from 'react';
import { Briefcase, Mail, UserRound } from 'lucide-react';
import { PageHead } from '../components/PageHead.tsx';

const KEY = 'veto-profile';

interface Profile {
  name: string;
  email: string;
  role: string;
}

const EMPTY: Profile = { name: '', email: '', role: 'Operator' };

function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return { name: parsed.name ?? '', email: parsed.email ?? '', role: parsed.role || EMPTY.role };
  } catch {
    return EMPTY;
  }
}

/** Name, email, and role for whoever is using this browser. Saved locally. */
export function SettingsView() {
  const [profile, setProfile] = useState(readProfile);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }, [profile]);

  const initial = profile.name.trim().charAt(0).toUpperCase();
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  return (
    <main className="page">
      <PageHead title="Settings" />
      <section className="dash-card profile" aria-label="Profile">
        <div className="profile-id">
          <div className="profile-avatar" aria-hidden="true">
            {initial || <UserRound size={22} />}
          </div>
          <div>
            <strong>{profile.name.trim() || 'Your name'}</strong>
            <span>{profile.email.trim() || 'Add an email'}</span>
          </div>
        </div>
        <div className="profile-fields">
        <label className="field">
          <span>
            <UserRound size={14} aria-hidden="true" /> Name
          </span>
          <input value={profile.name} placeholder="Your name" autoComplete="name" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>
            <Mail size={14} aria-hidden="true" /> Email
          </span>
          <input type="email" value={profile.email} placeholder="you@lab.example" autoComplete="email" onChange={(e) => set({ email: e.target.value })} />
        </label>
        <div className="field">
          <span>
            <Briefcase size={14} aria-hidden="true" /> Role
          </span>
          <div className="runs" role="radiogroup" aria-label="Role">
            {['Operator', 'Reviewer'].map((role) => (
              <button key={role} type="button" role="radio" aria-checked={profile.role === role} onClick={() => set({ role })}>
                {role}
              </button>
            ))}
          </div>
        </div>
        </div>
      </section>
    </main>
  );
}
