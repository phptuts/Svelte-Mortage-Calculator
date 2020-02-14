<script>
  let interesetSliderValue = 375;
  let years = 15;
  let loanAmount = 650000;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  });

  $: totalPayments = years * 12;
  $: monthlyInterestRate = interesetSliderValue / 100 / 100 / 12;

  $: monthlyPayments =
    (loanAmount *
      Math.pow(1 + monthlyInterestRate, totalPayments) *
      monthlyInterestRate) /
    (Math.pow(1 + monthlyInterestRate, totalPayments) - 1);
  $: totalPaid = monthlyPayments * totalPayments;
  $: monthlyPaymentsFormated = formatter.format(monthlyPayments);
  $: totalPaidFormated = formatter.format(totalPaid);
  $: interestPaidFormated = formatter.format(totalPaid - loanAmount);
</script>

<style>
  .outputs {
    font-size: 20px;
    border: solid;
    margin-top: 15px;
    text-align: center;
  }
</style>

<main class="container">
  <div class="row">
    <h1>Mortgage Calculator</h1>
  </div>
  <div class="row">
    <label>Loan Amount</label>
    <input
      class="u-full-width"
      bind:value={loanAmount}
      type="number"
      min="0"
      placeholder="10000" />
  </div>
  <div class="row">
    <div class="six columns">
      <label>Years</label>
      <input
        class="u-full-width"
        bind:value={years}
        type="range"
        min="1"
        max="40" />
    </div>
    <div class="six columns outputs">{years} years</div>
  </div>
  <div class="row">
    <div class="six columns">
      <label>Interest Rate</label>
      <input
        class="u-full-width"
        bind:value={interesetSliderValue}
        type="range"
        min="1"
        max="2000" />
    </div>
    <div class="six columns outputs">
      {(interesetSliderValue / 100).toFixed(2)}%
    </div>
  </div>
  <div class="row outputs">Monthly Payments {monthlyPaymentsFormated}</div>
  <div class="row outputs">Total Paid {totalPaidFormated}</div>
  <div class="row outputs">Interest Paid {interestPaidFormated}</div>
</main>
