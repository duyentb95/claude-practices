export function CronjobGuard(): MethodDecorator {
  const isRunning: { [key: string]: boolean } = {};
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const key = `${this.constructor.name}-${propertyKey.toString()}`;
      if (isRunning[key]) {
        return;
      }
      isRunning[key] = true;
      try {
        await originalMethod.apply(this, [...args]);
      } catch (e) {
        console.log(e, new Date());
      }
      isRunning[key] = false;
    };
    return descriptor;
  };
}