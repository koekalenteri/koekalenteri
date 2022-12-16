import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Box, Typography } from "@mui/material";

export function ErrorPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'background.default'
      }}
    >
      <ErrorInfo />
    </Box>
  )
}

function ErrorInfo() {
  const error = useRouteError()
  console.error(error);

  if (isRouteErrorResponse(error)) {
    return (
      <>
        <Typography variant="h1">Oops</Typography>
        <Typography variant="h2">{error.status}</Typography>
        <Typography variant="body1">{error.statusText}</Typography>
        {error.data?.message && <p>{error.data.message}</p>}
      </>
    )
  }
  return <Typography variant="h1">Oops</Typography>
}
