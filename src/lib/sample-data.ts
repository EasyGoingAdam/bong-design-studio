import { User } from './types';

/**
 * Default users used as a fallback when no Supabase session is available
 * or during initial app load. Real user data comes from Supabase Auth +
 * the profiles table. This list is only the fallback seed for currentUser.
 */
export const sampleUsers: User[] = [
  { id: 'u1', name: 'Alex Rivera', role: 'admin', avatar: 'AR' },
  { id: 'u2', name: 'Jordan Chen', role: 'designer', avatar: 'JC' },
  { id: 'u3', name: 'Sam Patel', role: 'reviewer', avatar: 'SP' },
];
