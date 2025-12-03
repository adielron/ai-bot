import { useEffect, useState } from 'react';

function App() {
   const [message, setMessage] = useState(''); // initialize state

   useEffect(() => {
      fetch('/api/hello') // uses Vite proxy
         .then((response) => response.json())
         .then((data) => setMessage(data.message))
         .catch((err) => console.error(err));
   }, []);

   return (
      <>
         <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
            <p className="text-blue-500 font-bold text-xl">{message}</p>
            <button className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
               Click Me
            </button>
         </div>
      </>
   );
}

export default App;
