export type HavenApp = { id: string; icon?: string; name: string; description: string; color: string; ink: string; href?: string };

// Add a destination URL when an application is ready to connect.
export const apps: readonly HavenApp[] = [
  { id: 'photos', name: 'Photos', description: 'Your memories, gathered.', color: '#bcc5ac', ink: '#516348' },
  { id: 'files', name: 'Files', description: 'Everything in its place.', color: '#d8c6a5', ink: '#80633d' },
  { id: 'media', name: 'Media', description: 'Something good to watch.', color: '#aebfc6', ink: '#456575' },
  { id: 'notes', name: 'Notes', description: 'Room for your ideas.', color: '#d4b7a7', ink: '#875e4a' },
];
