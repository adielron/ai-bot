import axios from 'axios';

/**
 * Get current weather for a city using OpenWeatherMap API
 */
export async function getWeather(city: string): Promise<string> {
   try {
      const apiKey = process.env.OPENWEATHER_API_KEY;

      if (!apiKey) throw new Error('Missing OpenWeatherMap API key');

      const response = await axios.get(
         `https://api.openweathermap.org/data/2.5/weather`,
         {
            params: {
               q: city,
               appid: apiKey,
               units: 'metric', // Celsius
            },
         }
      );

      const data = response.data;
      const temp = data.main.temp;
      const description = data.weather[0].description;

      return `The weather in ${city} is ${temp}°C, ${description}.`;
   } catch (error) {
      console.error(error);
      return `Sorry, I couldn't fetch the weather for "${city}".`;
   }
}
