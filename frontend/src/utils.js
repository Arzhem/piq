// Extracts the domain name from a full URL string
export function getHostname(url) {
  try { 
    return new URL(url).hostname; 
  } catch(e) { 
    return ''; 
  }
}

export function timeAgo(dateString) {
  const past = new Date(dateString);
  const diffMins = Math.round((new Date().getTime() - past.getTime()) / 60000);
  const diffDays = Math.floor(diffMins / 1440);

  if (diffDays >= 7) return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${diffDays}d ago`;
}

// Checks password strength against specific criteria
export function validatePassword(pwd) {
  if (pwd.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pwd)) return "Password must contain an uppercase letter.";
  if (!/[0-9]/.test(pwd)) return "Password must contain a number.";
  return "";
}
