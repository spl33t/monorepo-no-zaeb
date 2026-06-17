import dayjs from 'dayjs';
//import fakeDependency from 'fake-dependency';

// core package
export const placeholder = "placeholder"

export function timestamp(): string {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}


/* export function fake(): string {
  return 2
}
 */

