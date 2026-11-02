"use client";

import { Button, Result } from "antd";

import { AppUserMenu } from "@/components/shared/AppUserMenu";
import { APP_ROUTES } from "@/constants/routes";

export function NoRolePage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-end px-4 pt-4">
        <AppUserMenu />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Result
          status="info"
          title="No role assigned"
          subTitle="Your account has no assigned role yet. Please contact your administrator for access."
          extra={
            <Button type="primary" href={APP_ROUTES.home}>
              Go home
            </Button>
          }
        />
      </div>
    </div>
  );
}
