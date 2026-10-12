function normalizeHost(host: string): string {
    return host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function generateNpmrc(host: string, packageName: string): string {
    const cleanHost = normalizeHost(host);
    const registryPath = `/api/v4/projects/\${CI_PROJECT_ID}/packages/npm/`;
    const registryUrl = `https://${cleanHost}${registryPath}`;
    const scope = packageName.startsWith("@") ? packageName.split("/")[0] : null;
    const registryLine = scope
        ? `${scope}:registry=${registryUrl}`
        : `registry=${registryUrl}`;
    return [
        registryLine,
        `//${cleanHost}${registryPath}:_authToken=\${CI_JOB_TOKEN}`,
    ].join('\n') + '\n';
}

export function generateGitlabCi(access = "restricted"): string {
    return `stages:
  - publish

publish-npm:
  stage: publish
  image: node:20-alpine
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - npm publish --access ${access}
`;
}
