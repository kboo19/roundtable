<script>
  import { 
    email, 
    password, 
    firstName, 
    lastName,
    loggedIn,
    emailAlreadyExists,
    registeredUsers,
    checkEmailStatus
  } from '../area/User/store.js';

  let loading = false;

  const handleSubmit = () => {
    loading = true;
    setTimeout(() => {
      if ($email && $password && $firstName && $lastName) {
        $loggedIn = true;
        $registeredUsers.push({
          email: $email,
          password: $password,
          firstName: $firstName,
          lastName: $lastName
        })
        loading = false;
      }
    }, 2000)
  }
</script>

<div class="loginContainer">
  <div class="box">
    <h1 class="title is-1">Sign Up</h1>
    <div class="field">
      <label class="label">Email Address</label>
      <div class="control">
        <input bind:value={$email} type="text" class="input" placeholder="blah@omg.com">
      </div>
      {#if $emailAlreadyExists === false}
        <p class="help is-success">This email is available</p>
      {/if}
      {#if $emailAlreadyExists === true}
        <p class="help is-danger">This email has been registered before</p>
      {/if}
    </div>
    <div class="field">
      <label class="label">Password</label>
      <div class="control">
        <input bind:value={$password} type="password" class="input" placeholder="no peeking, jerk">
      </div>
    </div>
    <div class="field">
      <label class="label">First Name</label>
      <div class="control">
        <input bind:value={$firstName} type="text" class="input" placeholder="John">
      </div>
    </div>
    <div class="field">
      <label class="label">Last Name</label>
      <div class="control">
        <input bind:value={$lastName} type="text" class="input" placeholder="Doe">
      </div>
    </div>
    <div class="buttons">
      <button on:click={handleSubmit} class="button is-primary">
        <strong>Sign up</strong>
      </button>
    </div>
    {#if loading}
      <progress class="progress is-small is-primary" max="100">15%</progress>
    {/if}
  </div>
</div>

<style>
  .loginContainer {
    width: 550px;
  }
</style>