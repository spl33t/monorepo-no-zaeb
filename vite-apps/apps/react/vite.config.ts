import react from '@vitejs/plugin-react';
import { extendsBaseConfig } from '../../vite.config.base.ts';

export default extendsBaseConfig({
  plugins: [react()],
});
