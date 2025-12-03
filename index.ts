import concurrently from 'concurrently';

(async () => {
   try {
      const result = await concurrently([
         {
            name: 'client',
            command: 'bun run dev',
            prefixColor: 'blue',
            cwd: './packages/client',
         },
         {
            name: 'server',
            command: 'bun run dev',
            prefixColor: 'green',
            cwd: './packages/server',
         },
      ]);

      console.log('All processes finished', result);
   } catch (err) {
      console.error('One of the processes failed', err);
   }
})();
