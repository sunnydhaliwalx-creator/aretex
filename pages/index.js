export default function Home() {
  // This page never renders client-side because we redirect in getServerSideProps
  return null;
}

export async function getServerSideProps({ req }) {
  const cookie = req.headers.cookie || '';
  const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aretex_session='));
  const hasSession = !!match;

  return {
    redirect: {
      destination: hasSession ? '/orders' : '/login',
      permanent: false
    }
  };
}
