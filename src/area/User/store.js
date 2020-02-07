import { writable, derived } from 'svelte/store';

export const email = writable(null);
export const password = writable('');
export const firstName = writable('');
export const lastName = writable('');
export const loggedIn = writable(false);

export const registeredUsers = writable([
  {
    email: 'khalil@ordermygear.com',
    password: 'password',
    firstName: 'Khalil',
    lastName: 'Bouaazzi'
  }
])

export const emailAlreadyExists = derived(email, 
  ($email, set) => {
    let users;
    registeredUsers.subscribe(value => {
      users = value;
    })
    set(null);
    if (!$email || $email === '') {
      console.log('there you go')
      set(null);
    }
    else set(!!users.find((user) => user.email === $email))
  }, null
);

export const checkEmailStatus = derived([email, emailAlreadyExists], 
  ([$email, $emailAlreadyExists], set) => {
    if ($email === null) {
      set('');
    }
    if ($email && !$emailAlreadyExists) {
      set('looks good');
    }

    if ($emailAlreadyExists === true) {
      set('already exists');
    }
    if (!$email) {
      set('');
    }
  }
)