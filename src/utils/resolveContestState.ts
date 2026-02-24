export function resolveContestState(contest: {
  submissionStartTime: Date | string;
  submissionEndTime: Date | string;
  votingStartTime: Date | string;
  votingEndTime: Date | string;
  resultTime: Date | string;
}) {
  const now = new Date();
  const submissionStart = new Date(contest.submissionStartTime);
  const submissionEnd = new Date(contest.submissionEndTime);
  const votingStart = new Date(contest.votingStartTime);
  const votingEnd = new Date(contest.votingEndTime);
  const resultTime = new Date(contest.resultTime);

  let state = "RESULTS_LIVE";
  let countdownLabel = "Results announced";
  let timeRemainingSeconds = 0;

  if (now < submissionStart) {
    state = "UPCOMING";
    countdownLabel = "Contest starts in";
    timeRemainingSeconds = Math.max(0, Math.ceil((submissionStart.getTime() - now.getTime()) / 1000));
  } else if (now >= submissionStart && now < submissionEnd) {
    state = "SUBMISSION_OPEN";
    countdownLabel = "Submission ends in";
    timeRemainingSeconds = Math.max(0, Math.ceil((submissionEnd.getTime() - now.getTime()) / 1000));
  } else if (now >= submissionEnd && now < votingStart) {
    state = "SUBMISSION_CLOSED_WAITING";
    countdownLabel = "Voting starts in";
    timeRemainingSeconds = Math.max(0, Math.ceil((votingStart.getTime() - now.getTime()) / 1000));
  } else if (now >= votingStart && now < votingEnd) {
    state = "VOTING_OPEN";
    countdownLabel = "Voting ends in";
    timeRemainingSeconds = Math.max(0, Math.ceil((votingEnd.getTime() - now.getTime()) / 1000));
  } else if (now >= votingEnd && now < resultTime) {
    state = "VOTING_CLOSED";
    countdownLabel = "Results in";
    timeRemainingSeconds = Math.max(0, Math.ceil((resultTime.getTime() - now.getTime()) / 1000));
  }

  return {
    state,
    countdownLabel,
    timeRemainingSeconds,
    serverTime: now.toISOString(),
  };
}
